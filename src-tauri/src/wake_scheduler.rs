//! Persistent one-shot wake scheduler. Wakes always resume an existing
//! conversation through the same ACP follow-up path as Event Rules.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use crate::acp::manager::ConnectionManager;
use crate::acp::types::PromptInputBlock;
use crate::db::service::agent_wake_service as wakes;
use crate::db::AppDatabase;
use crate::db::entities::conversation;
use crate::web::event_bridge::EventEmitter;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};

pub struct WakeScheduler {
    db: AppDatabase,
    manager: ConnectionManager,
    data_dir: PathBuf,
    emitter: EventEmitter,
    owner_window_label: String,
    terminal_owners: Arc<std::sync::RwLock<HashMap<String, String>>>,
}

impl WakeScheduler {
    pub fn new(
        db: AppDatabase,
        manager: ConnectionManager,
        data_dir: PathBuf,
        emitter: EventEmitter,
        owner_window_label: String,
    ) -> Arc<Self> {
        Arc::new(Self {
            db,
            manager,
            data_dir,
            emitter,
            owner_window_label,
            terminal_owners: Arc::new(std::sync::RwLock::new(HashMap::new())),
        })
    }

    pub fn register_terminal(&self, terminal_id: String, connection_id: String) {
        self.terminal_owners
            .write()
            .expect("wake terminal owner lock poisoned")
            .insert(terminal_id, connection_id);
    }

    pub fn terminal_owned_by(&self, terminal_id: &str, connection_id: &str) -> bool {
        self.terminal_owners
            .read()
            .expect("wake terminal owner lock poisoned")
            .get(terminal_id)
            .is_some_and(|owner| owner == connection_id)
    }

    fn unregister_terminal(&self, terminal_id: &str) {
        self.terminal_owners
            .write()
            .expect("wake terminal owner lock poisoned")
            .remove(terminal_id);
    }

    pub async fn run(self: Arc<Self>) {
        self.process_due().await;
        let mut interval = tokio::time::interval(Duration::from_secs(1));
        loop {
            interval.tick().await;
            self.process_due().await;
        }
    }

    pub async fn process_due(&self) {
        if let Err(error) = wakes::recover_stale_dispatching(
            &self.db.conn,
            chrono::Utc::now(),
            chrono::Duration::seconds(30),
        )
        .await
        {
            tracing::error!("[wake] stale dispatch recovery failed: {error}");
        }
        let rows = match wakes::claim_due(&self.db.conn, chrono::Utc::now(), 32).await {
            Ok(rows) => rows,
            Err(error) => {
                tracing::error!("[wake] claim due rows failed: {error}");
                return;
            }
        };
        for wake in rows {
            self.dispatch(wake).await;
        }
    }

    /// Called by a typed terminal producer. The database claim absorbs both
    /// PTY EOF and the manager's periodic exit check when they race.
    pub async fn on_process_exit(&self, terminal_id: &str) {
        self.unregister_terminal(terminal_id);
        let rows = match wakes::claim_process_exit_for_source(&self.db.conn, terminal_id, None, None).await {
            Ok(rows) => rows,
            Err(error) => {
                tracing::error!(terminal_id, "[wake] claim process exit failed: {error}");
                return;
            }
        };
        for wake in rows {
            self.dispatch(wake).await;
        }
    }

    pub async fn on_process_exit_for_source(
        &self,
        terminal_id: &str,
        source_conversation_id: i32,
        source_connection_id: &str,
    ) {
        self.unregister_terminal(terminal_id);
        let rows = match wakes::claim_process_exit_for_source(
            &self.db.conn,
            terminal_id,
            Some(source_conversation_id),
            Some(source_connection_id),
        )
        .await
        {
            Ok(rows) => rows,
            Err(error) => {
                tracing::error!(terminal_id, source_conversation_id, "[wake] scoped process exit claim failed: {error}");
                return;
            }
        };
        for wake in rows {
            self.dispatch(wake).await;
        }
    }

    async fn dispatch(&self, wake: crate::db::entities::agent_wake::Model) {
        let Some(source) = conversation::Entity::find_by_id(wake.source_conversation_id)
            .filter(conversation::Column::DeletedAt.is_null())
            .one(&self.db.conn)
            .await
            .ok()
            .flatten()
        else {
            let _ = wakes::mark_failed(
                &self.db.conn,
                wake.id,
                "target_unavailable: source conversation not found".into(),
            )
            .await;
            return;
        };
        let (emitter, owner_window_label) = if let Some(source_connection_id) =
            wake.source_connection_id.as_deref()
        {
            self.manager
                .runtime_context_for_connection(source_connection_id)
                .await
                .unwrap_or_else(|| (self.emitter.clone(), self.owner_window_label.clone()))
        } else {
            (self.emitter.clone(), self.owner_window_label.clone())
        };
        let connection_id = match self
            .manager
            .ensure_existing_conversation_ready(
                &self.db,
                &self.data_dir,
                wake.source_conversation_id,
                owner_window_label,
                emitter,
            )
            .await
        {
            Ok(connection_id) => connection_id,
            Err(error) => {
                let _ = wakes::mark_failed(
                    &self.db.conn,
                    wake.id,
                    format!("target_unavailable: {error}"),
                )
                .await;
                return;
            }
        };
        let result = self
            .manager
            .send_prompt_linked_with_message_id(
                &self.db,
                &connection_id,
                vec![PromptInputBlock::Text {
                    text: wake.prompt.clone(),
                }],
                Some(source.folder_id),
                Some(wake.source_conversation_id),
                None,
                None,
            )
            .await;
        match result {
            Ok(_) => {
                if let Err(error) = wakes::mark_sent(&self.db.conn, wake.id).await {
                    tracing::error!(wake_id = wake.id, "[wake] sent but receipt failed: {error}");
                }
            }
            Err(error) => {
                let _ = wakes::mark_failed(&self.db.conn, wake.id, error.to_string()).await;
            }
        }
    }
}
