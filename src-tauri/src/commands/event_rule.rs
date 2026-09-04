//! Event rule CRUD commands. `*_core` fns are mode-agnostic.

use crate::db::error::DbError;
use crate::db::service::event_rule_service;
use crate::db::AppDatabase;
use crate::event_rules::EventRulesEngineHandle;
use crate::models::{EventRuleDraft, EventRuleInfo};

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
    let info = event_rule_service::update(&db.conn, id, draft).await?;
    engine.reload_rules().await;
    Ok(info)
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_helpers::fresh_in_memory_db;
    use crate::event_rules::types::{
        ActionKind, ConditionKind, ContainsMatchMode, ConversationRef, EventRuleConfig,
        LifecycleTrigger, RuleAction, RuleCondition, RuleGuard,
    };
    use crate::event_rules::{EventRulesEngine, EventRulesEngineHandle};
    use crate::db::AppDatabase;
    use crate::acp::{EventBusMetrics, InternalEventBus};
    use crate::acp::manager::ConnectionManager;
    use std::sync::Arc;

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
}
