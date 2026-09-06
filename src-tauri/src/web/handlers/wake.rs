use crate::app_error::AppCommandError;
use crate::app_state::AppState;
use crate::commands::wake::{self, WakeDraft};
use axum::{extract::Extension, Json};
use serde::Deserialize;
use std::sync::Arc;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListWake {
    pub source_conversation_id: i32,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelWake {
    pub source_conversation_id: i32,
    pub id: i32,
}

pub async fn wake_list(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<ListWake>,
) -> Result<Json<serde_json::Value>, AppCommandError> {
    Ok(Json(
        serde_json::to_value(
            wake::wake_list_core(&state.db, params.source_conversation_id)
                .await
                .map_err(AppCommandError::from)?,
        )
        .expect("wake serialize"),
    ))
}
pub async fn wake_create(
    Extension(state): Extension<Arc<AppState>>,
    Json(draft): Json<WakeDraft>,
) -> Result<Json<serde_json::Value>, AppCommandError> {
    Ok(Json(
        serde_json::to_value(
            wake::wake_create_core(&state.db, draft)
                .await
                .map_err(AppCommandError::from)?,
        )
        .expect("wake serialize"),
    ))
}
pub async fn wake_cancel(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<CancelWake>,
) -> Result<Json<serde_json::Value>, AppCommandError> {
    Ok(Json(
        serde_json::to_value(
            wake::wake_cancel_core(&state.db, params.source_conversation_id, params.id)
                .await
                .map_err(AppCommandError::from)?,
        )
        .expect("wake serialize"),
    ))
}
