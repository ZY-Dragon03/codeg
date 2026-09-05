//! Persistent one-shot wake scheduler. Wakes always resume an existing
//! conversation through the same ACP follow-up path as Event Rules.

use std::sync::Arc;
use std::time::Duration;

use crate::acp::manager::ConnectionManager;
use crate::acp::types::PromptInputBlock;
use crate::db::service::agent_wake_service as wakes;
use crate::db::AppDatabase;
use crate::db::entities::conversation;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};

pub struct WakeScheduler {
    db: AppDatabase,
    manager: ConnectionManager,
}

impl WakeScheduler {
    pub fn new(db: AppDatabase, manager: ConnectionManager) -> Arc<Self> {
        Arc::new(Self { db, manager })
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
        let rows = match wakes::claim_process_exit(&self.db.conn, terminal_id).await {
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
        let Some(connection_id) = self
            .manager
            .find_eligible_connection_by_conversation_id(wake.source_conversation_id)
            .await
        else {
            let _ = wakes::mark_failed(
                &self.db.conn,
                wake.id,
                "target_unavailable: no connected idle conversation".into(),
            )
            .await;
            return;
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
