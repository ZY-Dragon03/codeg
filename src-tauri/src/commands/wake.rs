use chrono::{DateTime, Utc};
use serde::Deserialize;

use crate::db::entities::agent_wake;
use crate::db::error::DbError;
use crate::db::service::agent_wake_service::{self, CreateWake};
use crate::db::AppDatabase;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WakeDraft {
    pub source_conversation_id: i32,
    pub source_connection_id: Option<String>,
    pub terminal_id: Option<String>,
    pub process_ref: Option<String>,
    pub trigger_kind: String,
    pub fire_at: Option<DateTime<Utc>>,
    pub prompt: String,
    #[serde(default = "default_creator_kind")]
    pub creator_kind: String,
    pub creator_id: Option<String>,
}

fn default_creator_kind() -> String {
    "user".into()
}

pub async fn wake_list_core(
    db: &AppDatabase,
    source_conversation_id: i32,
) -> Result<Vec<agent_wake::Model>, DbError> {
    agent_wake_service::list_for_source(&db.conn, source_conversation_id).await
}

pub async fn wake_create_core(
    db: &AppDatabase,
    draft: WakeDraft,
) -> Result<agent_wake::Model, DbError> {
    agent_wake_service::create(
        &db.conn,
        CreateWake {
            source_conversation_id: draft.source_conversation_id,
            source_connection_id: draft.source_connection_id,
            terminal_id: draft.terminal_id,
            process_ref: draft.process_ref,
            trigger_kind: draft.trigger_kind,
            fire_at: draft.fire_at,
            prompt: draft.prompt,
            creator_kind: draft.creator_kind,
            creator_id: draft.creator_id,
        },
    )
    .await
}

pub async fn wake_cancel_core(
    db: &AppDatabase,
    source_conversation_id: i32,
    id: i32,
) -> Result<agent_wake::Model, DbError> {
    agent_wake_service::cancel(&db.conn, source_conversation_id, id).await
}

pub async fn wake_update_core(
    db: &AppDatabase,
    source_conversation_id: i32,
    id: i32,
    draft: WakeDraft,
) -> Result<agent_wake::Model, DbError> {
    agent_wake_service::update(
        &db.conn,
        source_conversation_id,
        id,
        CreateWake {
            source_conversation_id: draft.source_conversation_id,
            source_connection_id: draft.source_connection_id,
            terminal_id: draft.terminal_id,
            process_ref: draft.process_ref,
            trigger_kind: draft.trigger_kind,
            fire_at: draft.fire_at,
            prompt: draft.prompt,
            creator_kind: draft.creator_kind,
            creator_id: draft.creator_id,
        },
    )
    .await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn wake_list(
    db: tauri::State<'_, AppDatabase>,
    source_conversation_id: i32,
) -> Result<Vec<agent_wake::Model>, DbError> {
    wake_list_core(&db, source_conversation_id).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn wake_create(
    db: tauri::State<'_, AppDatabase>,
    draft: WakeDraft,
) -> Result<agent_wake::Model, DbError> {
    wake_create_core(&db, draft).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn wake_cancel(
    db: tauri::State<'_, AppDatabase>,
    source_conversation_id: i32,
    id: i32,
) -> Result<agent_wake::Model, DbError> {
    wake_cancel_core(&db, source_conversation_id, id).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn wake_update(
    db: tauri::State<'_, AppDatabase>,
    source_conversation_id: i32,
    id: i32,
    draft: WakeDraft,
) -> Result<agent_wake::Model, DbError> {
    wake_update_core(&db, source_conversation_id, id, draft).await
}
