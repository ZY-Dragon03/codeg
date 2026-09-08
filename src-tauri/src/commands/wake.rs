use chrono::{DateTime, Utc};
use serde::Deserialize;

use crate::db::entities::agent_wake;
use crate::db::error::DbError;
use crate::db::service::agent_wake_service::{self, CreateWake};
use crate::db::AppDatabase;
use crate::terminal::manager::TerminalManager;
use crate::web::event_bridge::{emit_automation_registry_changed, EventEmitter};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WakeDraft {
    pub source_conversation_id: i32,
    pub source_connection_id: Option<String>,
    pub terminal_id: Option<String>,
    pub process_ref: Option<String>,
    pub trigger_kind: String,
    pub fire_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub delay_ms: Option<i64>,
    pub prompt: String,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default = "default_creator_kind")]
    pub creator_kind: String,
    pub creator_id: Option<String>,
}

fn default_creator_kind() -> String {
    "user".into()
}

fn draft_to_create(draft: WakeDraft) -> CreateWake {
    CreateWake {
        source_conversation_id: draft.source_conversation_id,
        source_connection_id: draft.source_connection_id,
        terminal_id: draft.terminal_id,
        process_ref: draft.process_ref,
        trigger_kind: draft.trigger_kind,
        fire_at: draft.fire_at,
        delay_ms: draft.delay_ms,
        prompt: draft.prompt,
        display_name: draft.display_name,
        creator_kind: draft.creator_kind,
        creator_id: draft.creator_id,
    }
}

fn emit_wake(emitter: &EventEmitter, wake_id: i32) {
    emit_automation_registry_changed(emitter, Some(wake_id), None);
}

pub async fn wake_list_core(
    db: &AppDatabase,
    source_conversation_id: i32,
) -> Result<Vec<agent_wake::Model>, DbError> {
    agent_wake_service::list_for_source(&db.conn, source_conversation_id).await
}

pub async fn wake_create_core(
    emitter: &EventEmitter,
    db: &AppDatabase,
    draft: WakeDraft,
) -> Result<agent_wake::Model, DbError> {
    let row = agent_wake_service::create(&db.conn, draft_to_create(draft)).await?;
    emit_wake(emitter, row.id);
    Ok(row)
}

pub async fn wake_cancel_core(
    emitter: &EventEmitter,
    db: &AppDatabase,
    source_conversation_id: i32,
    id: i32,
) -> Result<agent_wake::Model, DbError> {
    let row = agent_wake_service::cancel(&db.conn, source_conversation_id, id).await?;
    emit_wake(emitter, row.id);
    Ok(row)
}

pub async fn wake_delete_core(
    emitter: &EventEmitter,
    db: &AppDatabase,
    source_conversation_id: i32,
    id: i32,
) -> Result<(), DbError> {
    agent_wake_service::delete(&db.conn, source_conversation_id, id).await?;
    emit_wake(emitter, id);
    Ok(())
}

pub async fn wake_rearm_core(
    emitter: &EventEmitter,
    db: &AppDatabase,
    terminal_manager: &TerminalManager,
    source_conversation_id: i32,
    id: i32,
) -> Result<agent_wake::Model, DbError> {
    let live_terminal_ids = terminal_manager
        .list_with_exit_check(Some(emitter))
        .into_iter()
        .map(|terminal| terminal.id)
        .collect::<Vec<_>>();
    let row =
        agent_wake_service::rearm(&db.conn, source_conversation_id, id, &live_terminal_ids)
            .await?;
    emit_wake(emitter, row.id);
    Ok(row)
}

pub async fn wake_update_core(
    emitter: &EventEmitter,
    db: &AppDatabase,
    source_conversation_id: i32,
    id: i32,
    draft: WakeDraft,
) -> Result<agent_wake::Model, DbError> {
    let row = agent_wake_service::update(
        &db.conn,
        source_conversation_id,
        id,
        draft_to_create(draft),
    )
    .await?;
    emit_wake(emitter, row.id);
    Ok(row)
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
    app: tauri::AppHandle,
    db: tauri::State<'_, AppDatabase>,
    draft: WakeDraft,
) -> Result<agent_wake::Model, DbError> {
    wake_create_core(&EventEmitter::Tauri(app), &db, draft).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn wake_cancel(
    app: tauri::AppHandle,
    db: tauri::State<'_, AppDatabase>,
    source_conversation_id: i32,
    id: i32,
) -> Result<agent_wake::Model, DbError> {
    wake_cancel_core(&EventEmitter::Tauri(app), &db, source_conversation_id, id).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn wake_delete(
    app: tauri::AppHandle,
    db: tauri::State<'_, AppDatabase>,
    source_conversation_id: i32,
    id: i32,
) -> Result<(), DbError> {
    wake_delete_core(&EventEmitter::Tauri(app), &db, source_conversation_id, id).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn wake_rearm(
    app: tauri::AppHandle,
    db: tauri::State<'_, AppDatabase>,
    terminal_manager: tauri::State<'_, TerminalManager>,
    source_conversation_id: i32,
    id: i32,
) -> Result<agent_wake::Model, DbError> {
    wake_rearm_core(
        &EventEmitter::Tauri(app),
        &db,
        &terminal_manager,
        source_conversation_id,
        id,
    )
    .await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn wake_update(
    app: tauri::AppHandle,
    db: tauri::State<'_, AppDatabase>,
    source_conversation_id: i32,
    id: i32,
    draft: WakeDraft,
) -> Result<agent_wake::Model, DbError> {
    wake_update_core(
        &EventEmitter::Tauri(app),
        &db,
        source_conversation_id,
        id,
        draft,
    )
    .await
}
