use std::sync::Arc;

use axum::{extract::Extension, Json};

use serde::Deserialize;

use crate::app_error::AppCommandError;

use crate::app_state::AppState;

use crate::commands::event_rule as core;

use crate::commands::event_rule::{EventRuleLogPage, EventRulePreview, PreviewSample};
use crate::models::{EventRuleDraft, EventRuleInfo};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]

pub struct GetEventRuleParams {
    pub id: i32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]

pub struct CreateEventRuleParams {
    pub draft: EventRuleDraft,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]

pub struct UpdateEventRuleParams {
    pub id: i32,

    pub draft: EventRuleDraft,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]

pub struct SetEventRuleEnabledParams {
    pub id: i32,

    pub enabled: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]

pub struct DeleteEventRuleParams {
    pub id: i32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewEventRuleParams {
    pub rule_id: Option<i32>,
    pub draft: EventRuleDraft,
    pub sample: PreviewSample,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidateEventRuleParams {
    pub draft: EventRuleDraft,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListEventRuleLogsParams {
    pub rule_id: Option<i32>,
    pub conversation_id: Option<i32>,
    pub cursor: Option<i32>,
    pub limit: Option<u64>,
}

pub async fn event_rule_list(
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<Vec<EventRuleInfo>>, AppCommandError> {
    Ok(Json(
        core::event_rule_list_core(&state.db)
            .await
            .map_err(AppCommandError::from)?,
    ))
}

pub async fn event_rule_get(
    Extension(state): Extension<Arc<AppState>>,

    Json(params): Json<GetEventRuleParams>,
) -> Result<Json<EventRuleInfo>, AppCommandError> {
    Ok(Json(
        core::event_rule_get_core(&state.db, params.id)
            .await
            .map_err(AppCommandError::from)?,
    ))
}

pub async fn event_rule_create(
    Extension(state): Extension<Arc<AppState>>,

    Json(params): Json<CreateEventRuleParams>,
) -> Result<Json<EventRuleInfo>, AppCommandError> {
    Ok(Json(
        core::event_rule_create_core(&state.db, &state.event_rules_engine, params.draft)
            .await
            .map_err(AppCommandError::from)?,
    ))
}

pub async fn event_rule_update(
    Extension(state): Extension<Arc<AppState>>,

    Json(params): Json<UpdateEventRuleParams>,
) -> Result<Json<EventRuleInfo>, AppCommandError> {
    Ok(Json(
        core::event_rule_update_core(
            &state.db,
            &state.event_rules_engine,
            params.id,
            params.draft,
        )
        .await
        .map_err(AppCommandError::from)?,
    ))
}

pub async fn event_rule_set_enabled(
    Extension(state): Extension<Arc<AppState>>,

    Json(params): Json<SetEventRuleEnabledParams>,
) -> Result<Json<EventRuleInfo>, AppCommandError> {
    Ok(Json(
        core::event_rule_set_enabled_core(
            &state.db,
            &state.event_rules_engine,
            params.id,
            params.enabled,
        )
        .await
        .map_err(AppCommandError::from)?,
    ))
}

pub async fn event_rule_delete(
    Extension(state): Extension<Arc<AppState>>,

    Json(params): Json<DeleteEventRuleParams>,
) -> Result<Json<()>, AppCommandError> {
    core::event_rule_delete_core(&state.db, &state.event_rules_engine, params.id)
        .await
        .map_err(AppCommandError::from)?;

    Ok(Json(()))
}

pub async fn event_rule_validate(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<ValidateEventRuleParams>,
) -> Result<Json<()>, AppCommandError> {
    core::event_rule_validate_core(&state.db, params.draft)
        .await
        .map_err(AppCommandError::from)?;
    Ok(Json(()))
}
pub async fn event_rule_preview(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<PreviewEventRuleParams>,
) -> Result<Json<EventRulePreview>, AppCommandError> {
    Ok(Json(
        core::event_rule_preview_core(&state.db, params.rule_id, params.draft, params.sample)
            .await
            .map_err(AppCommandError::from)?,
    ))
}
pub async fn event_rule_list_logs(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<ListEventRuleLogsParams>,
) -> Result<Json<EventRuleLogPage>, AppCommandError> {
    Ok(Json(
        core::event_rule_list_logs_core(
            &state.db,
            params.rule_id,
            params.conversation_id,
            params.cursor,
            params.limit.unwrap_or(50),
        )
        .await
        .map_err(AppCommandError::from)?,
    ))
}
