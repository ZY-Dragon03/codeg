use crate::app_error::AppCommandError;
use crate::app_state::AppState;
use crate::commands::automation_registry as registry;
use axum::{extract::Extension, Json};
use serde::Deserialize;
use std::sync::Arc;

pub async fn automation_registry_list(
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, AppCommandError> {
    let items = registry::automation_registry_list_core(&state.db)
        .await
        .map_err(AppCommandError::from)?;
    Ok(Json(
        serde_json::to_value(items).expect("registry items serialize"),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrySource {
    pub source_conversation_id: i32,
}
