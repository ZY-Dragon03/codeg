//! Event rule CRUD commands. `*_core` fns are mode-agnostic.

use crate::db::error::DbError;
use crate::db::service::event_rule_service;
use crate::db::AppDatabase;
use crate::event_rules::matcher::{condition_matches, scope_matches};
use crate::event_rules::types::{LifecycleEvent, LifecycleTrigger};
use crate::event_rules::EventRulesEngineHandle;
use crate::models::{EventRuleDraft, EventRuleInfo};
use chrono::{DateTime, Utc};
use sea_orm::{ColumnTrait, Condition, EntityTrait, QueryFilter, QueryOrder, QuerySelect};
#[cfg(test)]
use sea_orm::PaginatorTrait;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewSample {
    pub conversation_id: i32,
    pub text: String,
    pub error_kind: Option<String>,
}
#[derive(Debug, Clone, Serialize)]
pub struct EventRulePreview {
    pub scope_matches: bool,
    pub condition_matches: bool,
    pub resolved_target_id: Option<i32>,
    pub target_available: bool,
    pub winner_rule_id: Option<i32>,
    pub draft_is_winner: bool,
    pub draft_is_shadowed: bool,
    pub shadowed_rule_ids: Vec<i32>,
    pub guard_blocked: Option<String>,
}
#[derive(Debug, Clone, Serialize)]
pub struct EventRuleLogInfo {
    pub id: i32,
    pub rule_id: i32,
    pub source_conversation_id: i32,
    pub status: String,
    pub detail: Option<String>,
    pub resolved_target_id: Option<i32>,
    pub trigger: Option<String>,
    pub action: Option<String>,
    pub prompt_snapshot: Option<String>,
    pub guard_reason: Option<String>,
    pub created_at: DateTime<Utc>,
}
#[derive(Debug, Clone, Serialize)]
pub struct EventRuleLogPage {
    pub items: Vec<EventRuleLogInfo>,
    pub next_cursor: Option<i32>,
}

async fn validate_authoritative(db: &AppDatabase, draft: &EventRuleDraft) -> Result<(), DbError> {
    draft.config.validate().map_err(DbError::Validation)?;
    use crate::event_rules::types::RuleScope;
    match draft.config.scope {
        RuleScope::Conversation { conversation_id } => {
            let ok = crate::db::entities::conversation::Entity::find_by_id(conversation_id)
                .filter(crate::db::entities::conversation::Column::DeletedAt.is_null())
                .one(&db.conn)
                .await?
                .is_some();
            if !ok {
                return Err(DbError::Validation(
                    "scope conversation does not exist or is deleted".into(),
                ));
            }
        }
        RuleScope::Folder { folder_id } => {
            let ok = crate::db::entities::folder::Entity::find_by_id(folder_id)
                .filter(crate::db::entities::folder::Column::DeletedAt.is_null())
                .one(&db.conn)
                .await?
                .is_some();
            if !ok {
                return Err(DbError::Validation(
                    "scope folder does not exist or is deleted".into(),
                ));
            }
        }
        _ => {}
    }
    if let crate::event_rules::types::ConversationRef::SpecificConversation =
        draft.config.action.conversation_ref
    {
        let id = draft.config.action.conversation_id.unwrap();
        let ok = crate::db::entities::conversation::Entity::find_by_id(id)
            .filter(crate::db::entities::conversation::Column::DeletedAt.is_null())
            .one(&db.conn)
            .await?
            .is_some();
        if !ok {
            return Err(DbError::Validation(
                "specific target does not exist or is deleted".into(),
            ));
        }
    }
    Ok(())
}

pub async fn event_rule_list_core(db: &AppDatabase) -> Result<Vec<EventRuleInfo>, DbError> {
    event_rule_service::list(&db.conn).await
}

pub async fn event_rule_get_core(db: &AppDatabase, id: i32) -> Result<EventRuleInfo, DbError> {
    event_rule_service::get(&db.conn, id).await
}

pub async fn event_rule_create_core(
    db: &AppDatabase,
    engine: &EventRulesEngineHandle,
    draft: EventRuleDraft,
) -> Result<EventRuleInfo, DbError> {
    validate_authoritative(db, &draft).await?;
    let info = event_rule_service::create(&db.conn, draft).await?;
    engine.reload_rules().await;
    Ok(info)
}

pub async fn event_rule_update_core(
    db: &AppDatabase,
    engine: &EventRulesEngineHandle,
    id: i32,
    draft: EventRuleDraft,
) -> Result<EventRuleInfo, DbError> {
    validate_authoritative(db, &draft).await?;
    let info = event_rule_service::update(&db.conn, id, draft).await?;
    engine.reload_rules().await;
    Ok(info)
}

pub async fn event_rule_preview_core(
    db: &AppDatabase,
    draft_rule_id: Option<i32>,
    draft: EventRuleDraft,
    sample: PreviewSample,
) -> Result<EventRulePreview, DbError> {
    validate_authoritative(db, &draft).await?;
    let row = crate::db::entities::conversation::Entity::find_by_id(sample.conversation_id)
        .one(&db.conn)
        .await?
        .ok_or_else(|| DbError::NotFound(format!("conversation {}", sample.conversation_id)))?;
    if row.deleted_at.is_some() {
        return Err(DbError::Validation("sample conversation is deleted".into()));
    }
    let event = LifecycleEvent {
        connection_id: String::new(),
        conversation_id: row.id,
        folder_id: row.folder_id,
        agent_type: row.agent_type,
        trigger: LifecycleTrigger::TurnFailed,
        error_kind: sample.error_kind,
        text: sample.text,
        turn_session_id: String::new(),
        failure_record_id: None,
        dedup_key: String::new(),
    };
    let scope_ok = scope_matches(&draft.config.scope, &event);
    let condition_ok = condition_matches(&draft.config.condition, &event);
    let rows = event_rule_service::list_enabled_rules(&db.conn).await?;
    let mut candidates = rows
        .iter()
        .filter(|r| Some(r.id) != draft_rule_id)
        .filter(|r| {
            scope_matches(&r.config.scope, &event) && condition_matches(&r.config.condition, &event)
        })
        .map(|r| (r.priority, r.id, Some(r.id), false, &r.config.guard))
        .collect::<Vec<_>>();
    if scope_ok && condition_ok {
        // An unsaved draft has no `id ASC` identity. At equal priority it is
        // ordered after persisted rules, which is deterministic and avoids
        // promising a precedence that may change when SQLite assigns its id.
        candidates.push((
            draft.priority,
            draft_rule_id.unwrap_or(i32::MAX),
            draft_rule_id,
            true,
            &draft.config.guard,
        ));
    }
    candidates.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
    let winner = candidates.first();
    let winner_rule_id = winner.and_then(|item| item.2);
    let draft_is_winner = winner.is_some_and(|item| item.3);
    let draft_is_shadowed = candidates.iter().skip(1).any(|item| item.3);
    let shadowed_rule_ids = candidates
        .iter()
        .skip(1)
        .filter_map(|item| (!item.3).then_some(item.2).flatten())
        .collect();
    let resolved_target_id = match draft.config.action.conversation_ref {
        crate::event_rules::types::ConversationRef::SourceConversation => {
            Some(event.conversation_id)
        }
        crate::event_rules::types::ConversationRef::SpecificConversation => {
            draft.config.action.conversation_id
        }
    };
    let target_available = if let Some(id) = resolved_target_id {
        crate::db::entities::conversation::Entity::find_by_id(id)
            .filter(crate::db::entities::conversation::Column::DeletedAt.is_null())
            .one(&db.conn)
            .await?
            .is_some()
    } else {
        false
    };
    let guard_blocked = if let Some((_, _, Some(rule_id), _, guard)) = winner {
        event_rule_service::inspect_guard(
            &db.conn,
            *rule_id,
            event.conversation_id,
            guard.max_attempts,
            guard.cooldown_ms,
        )
        .await?
    } else {
        None
    };
    Ok(EventRulePreview {
        scope_matches: scope_ok,
        condition_matches: condition_ok,
        resolved_target_id,
        target_available,
        winner_rule_id,
        draft_is_winner,
        draft_is_shadowed,
        shadowed_rule_ids,
        guard_blocked,
    })
}

pub async fn event_rule_validate_core(
    db: &AppDatabase,
    draft: EventRuleDraft,
) -> Result<(), DbError> {
    validate_authoritative(db, &draft).await
}

pub async fn event_rule_list_logs_core(
    db: &AppDatabase,
    rule_id: Option<i32>,
    conversation_id: Option<i32>,
    cursor: Option<i32>,
    limit: u64,
) -> Result<EventRuleLogPage, DbError> {
    let mut q = crate::db::entities::event_rule_log::Entity::find()
        .order_by_desc(crate::db::entities::event_rule_log::Column::Id);
    if let Some(id) = rule_id {
        q = q.filter(crate::db::entities::event_rule_log::Column::RuleId.eq(id));
    }
    if let Some(id) = conversation_id {
        q = q.filter(
            Condition::any()
                .add(crate::db::entities::event_rule_log::Column::SourceConversationId.eq(id))
                .add(crate::db::entities::event_rule_log::Column::ConversationId.eq(id)),
        );
    }
    if let Some(id) = cursor {
        q = q.filter(crate::db::entities::event_rule_log::Column::Id.lt(id));
    }
    let page_size = limit.clamp(1, 100) as usize;
    let mut rows = q.limit((page_size + 1) as u64).all(&db.conn).await?;
    let has_more = rows.len() > page_size;
    rows.truncate(page_size);
    let next_cursor = has_more.then(|| rows.last().map(|r| r.id)).flatten();
    Ok(EventRuleLogPage {
        items: rows
            .into_iter()
            .map(|r| EventRuleLogInfo {
                id: r.id,
                rule_id: r.rule_id,
                source_conversation_id: r.source_conversation_id.unwrap_or(r.conversation_id),
                status: if r.kind == "executed" || r.kind == "fired" {
                    "fired".into()
                } else if r.kind.starts_with("skipped") {
                    "skipped".into()
                } else {
                    "failed".into()
                },
                detail: r.detail,
                resolved_target_id: r.resolved_target_id,
                trigger: r.trigger,
                action: r.action,
                prompt_snapshot: r.prompt_snapshot,
                guard_reason: r.guard_reason,
                created_at: r.created_at,
            })
            .collect(),
        next_cursor,
    })
}

pub async fn event_rule_set_enabled_core(
    db: &AppDatabase,
    engine: &EventRulesEngineHandle,
    id: i32,
    enabled: bool,
) -> Result<EventRuleInfo, DbError> {
    let info = event_rule_service::set_enabled(&db.conn, id, enabled).await?;
    engine.reload_rules().await;
    Ok(info)
}

pub async fn event_rule_delete_core(
    db: &AppDatabase,
    engine: &EventRulesEngineHandle,
    id: i32,
) -> Result<(), DbError> {
    event_rule_service::delete(&db.conn, id).await?;
    engine.reload_rules().await;
    Ok(())
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn event_rule_list(
    db: tauri::State<'_, AppDatabase>,
) -> Result<Vec<EventRuleInfo>, DbError> {
    event_rule_list_core(&db).await
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn event_rule_get(
    db: tauri::State<'_, AppDatabase>,
    id: i32,
) -> Result<EventRuleInfo, DbError> {
    event_rule_get_core(&db, id).await
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn event_rule_create(
    db: tauri::State<'_, AppDatabase>,
    engine: tauri::State<'_, EventRulesEngineHandle>,
    draft: EventRuleDraft,
) -> Result<EventRuleInfo, DbError> {
    event_rule_create_core(&db, &engine, draft).await
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn event_rule_update(
    db: tauri::State<'_, AppDatabase>,
    engine: tauri::State<'_, EventRulesEngineHandle>,
    id: i32,
    draft: EventRuleDraft,
) -> Result<EventRuleInfo, DbError> {
    event_rule_update_core(&db, &engine, id, draft).await
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn event_rule_set_enabled(
    db: tauri::State<'_, AppDatabase>,
    engine: tauri::State<'_, EventRulesEngineHandle>,
    id: i32,
    enabled: bool,
) -> Result<EventRuleInfo, DbError> {
    event_rule_set_enabled_core(&db, &engine, id, enabled).await
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn event_rule_delete(
    db: tauri::State<'_, AppDatabase>,
    engine: tauri::State<'_, EventRulesEngineHandle>,
    id: i32,
) -> Result<(), DbError> {
    event_rule_delete_core(&db, &engine, id).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn event_rule_validate(
    db: tauri::State<'_, AppDatabase>,
    draft: EventRuleDraft,
) -> Result<(), DbError> {
    validate_authoritative(&db, &draft).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn event_rule_preview(
    db: tauri::State<'_, AppDatabase>,
    rule_id: Option<i32>,
    draft: EventRuleDraft,
    sample: PreviewSample,
) -> Result<EventRulePreview, DbError> {
    event_rule_preview_core(&db, rule_id, draft, sample).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn event_rule_list_logs(
    db: tauri::State<'_, AppDatabase>,
    rule_id: Option<i32>,
    conversation_id: Option<i32>,
    cursor: Option<i32>,
    limit: Option<u64>,
) -> Result<EventRuleLogPage, DbError> {
    event_rule_list_logs_core(&db, rule_id, conversation_id, cursor, limit.unwrap_or(50)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acp::manager::ConnectionManager;
    use crate::acp::{EventBusMetrics, InternalEventBus};
    use crate::db::entities::{event_rule_attempt, event_rule_log};
    use crate::db::test_helpers::{fresh_in_memory_db, seed_conversation, seed_folder};
    use crate::db::AppDatabase;
    use crate::event_rules::types::{
        ActionKind, ConditionKind, ContainsMatchMode, ConversationRef, EventRuleConfig,
        LifecycleTrigger, RuleAction, RuleCondition, RuleGuard,
    };
    use crate::event_rules::{EventRulesEngine, EventRulesEngineHandle};
    use std::sync::Arc;

    fn draft_for_conversation(conversation_id: i32) -> EventRuleDraft {
        EventRuleDraft {
            name: "preview draft".into(),
            enabled: false,
            priority: 500,
            config: EventRuleConfig {
                scope: crate::event_rules::types::RuleScope::Conversation { conversation_id },
                trigger: LifecycleTrigger::TurnFailed,
                condition: RuleCondition {
                    kind: ConditionKind::Contains,
                    match_mode: ContainsMatchMode::Any,
                    text_contains: vec!["MY_CUSTOM_ERROR_123".into()],
                    regex: None,
                    error_kind: None,
                },
                action: RuleAction {
                    kind: ActionKind::SendToConversation,
                    conversation_ref: ConversationRef::SourceConversation,
                    conversation_id: None,
                    prompt: "custom recovery".into(),
                },
                guard: RuleGuard { max_attempts: 3, cooldown_ms: 0 },
            },
        }
    }

    #[tokio::test]
    async fn crud_reload_picks_up_enabled_rule_without_restart() {
        let db = fresh_in_memory_db().await;
        let handle = EventRulesEngineHandle::new();
        let engine = Arc::new(EventRulesEngine::new(
            AppDatabase {
                conn: db.conn.clone(),
            },
            ConnectionManager::new(),
            Arc::new(InternalEventBus::new(Arc::new(EventBusMetrics::default()))),
        ));
        engine.reload_rules().await;
        handle.set(engine);

        let draft = EventRuleDraft {
            name: "hot reload".into(),
            enabled: true,
            priority: 50,
            config: EventRuleConfig {
                scope: Default::default(),
                trigger: LifecycleTrigger::TurnFailed,
                condition: RuleCondition {
                    kind: ConditionKind::None,
                    match_mode: ContainsMatchMode::All,
                    text_contains: vec![],
                    regex: None,
                    error_kind: None,
                },
                action: RuleAction {
                    kind: ActionKind::SendToConversation,
                    conversation_ref: ConversationRef::SourceConversation,
                    conversation_id: None,
                    prompt: "继续".into(),
                },
                guard: RuleGuard {
                    max_attempts: 3,
                    cooldown_ms: 5000,
                },
            },
        };

        let created = event_rule_create_core(&db, &handle, draft).await.unwrap();
        let loaded = handle
            .get()
            .expect("engine")
            .enabled_rule_ids_for_test()
            .await
            .contains(&created.id);
        assert!(loaded, "create must hot-reload enabled rules");

        event_rule_delete_core(&db, &handle, created.id)
            .await
            .unwrap();
        let empty = handle
            .get()
            .expect("engine")
            .enabled_rule_ids_for_test()
            .await
            .is_empty();
        assert!(empty, "delete must hot-reload and drop removed rules");
    }

    #[tokio::test]
    async fn preview_evaluates_disabled_draft_without_side_effects() {
        let db = fresh_in_memory_db().await;
        let folder_id = seed_folder(&db, "/tmp/preview").await;
        let conversation_id =
            seed_conversation(&db, folder_id, crate::models::agent::AgentType::Cursor).await;
        let before_attempts = event_rule_attempt::Entity::find()
            .count(&db.conn)
            .await
            .unwrap();
        let before_logs = event_rule_log::Entity::find().count(&db.conn).await.unwrap();

        let preview = event_rule_preview_core(
            &db,
            None,
            draft_for_conversation(conversation_id),
            PreviewSample {
                conversation_id,
                text: "failure MY_CUSTOM_ERROR_123".into(),
                error_kind: Some("connection".into()),
            },
        )
        .await
        .unwrap();

        assert!(preview.scope_matches && preview.condition_matches);
        assert!(preview.draft_is_winner);
        assert_eq!(preview.resolved_target_id, Some(conversation_id));
        assert_eq!(
            event_rule_attempt::Entity::find().count(&db.conn).await.unwrap(),
            before_attempts
        );
        assert_eq!(
            event_rule_log::Entity::find().count(&db.conn).await.unwrap(),
            before_logs
        );
    }

    #[tokio::test]
    async fn structured_logs_page_by_rule_and_conversation() {
        use crate::db::service::event_rule_service::{
            append_execution_log, ExecutionLogDraft,
        };
        let db = fresh_in_memory_db().await;
        let folder_id = seed_folder(&db, "/tmp/log-page").await;
        let conversation_id =
            seed_conversation(&db, folder_id, crate::models::agent::AgentType::Cursor).await;
        for prompt in ["one", "two", "three"] {
            append_execution_log(
                &db.conn,
                ExecutionLogDraft {
                    rule_id: 1,
                    source_conversation_id: conversation_id,
                    resolved_target_id: Some(conversation_id),
                    status: "fired",
                    detail: None,
                    trigger: "turn_failed",
                    action: "send_to_conversation",
                    prompt_snapshot: prompt.into(),
                    guard_reason: None,
                },
            )
            .await
            .unwrap();
        }

        let first = event_rule_list_logs_core(
            &db,
            Some(1),
            Some(conversation_id),
            None,
            2,
        )
        .await
        .unwrap();
        assert_eq!(first.items.len(), 2);
        assert_eq!(first.items[0].status, "fired");
        assert_eq!(first.items[0].resolved_target_id, Some(conversation_id));
        let second = event_rule_list_logs_core(
            &db,
            Some(1),
            Some(conversation_id),
            first.next_cursor,
            2,
        )
        .await
        .unwrap();
        assert_eq!(second.items.len(), 1);
        assert_eq!(second.items[0].prompt_snapshot.as_deref(), Some("one"));
    }
}
