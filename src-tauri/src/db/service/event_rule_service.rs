//! Event rule persistence, guard accounting, and audit log.

use chrono::{Duration, Utc};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Set,
    TransactionTrait,
};

use crate::db::entities::{event_rule, event_rule_attempt, event_rule_log};
use crate::db::error::DbError;
use crate::event_rules::types::{EventRuleConfig, ParsedEventRule};
use crate::models::{EventRuleDraft, EventRuleInfo};

/// If no auto-resume fired for this long, the next failure starts a new chain.
const ATTEMPT_CHAIN_IDLE_RESET: Duration = Duration::minutes(30);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GuardDecision {
    Allowed,
    Cooldown,
    MaxAttempts,
}

#[derive(Debug, Clone)]
pub struct ExecutionLogDraft {
    pub rule_id: i32,
    pub source_conversation_id: i32,
    pub resolved_target_id: Option<i32>,
    pub status: &'static str,
    pub detail: Option<String>,
    pub trigger: &'static str,
    pub action: &'static str,
    pub prompt_snapshot: String,
    pub guard_reason: Option<&'static str>,
}

pub async fn inspect_guard(
    db: &DatabaseConnection,
    rule_id: i32,
    conversation_id: i32,
    max_attempts: u32,
    cooldown_ms: u64,
) -> Result<Option<String>, DbError> {
    let Some(row) = event_rule_attempt::Entity::find_by_id((rule_id, conversation_id))
        .one(db)
        .await?
    else {
        return Ok(None);
    };
    let Some(last) = row.last_fired_at else {
        return Ok(None);
    };
    let elapsed = Utc::now().signed_duration_since(last);
    if elapsed > ATTEMPT_CHAIN_IDLE_RESET {
        return Ok(None);
    }
    if elapsed < Duration::milliseconds(cooldown_ms as i64) {
        return Ok(Some("skipped_cooldown".into()));
    }
    if row.attempt_count >= max_attempts as i32 {
        return Ok(Some("skipped_max_attempts".into()));
    }
    Ok(None)
}

fn to_info(row: event_rule::Model) -> Result<EventRuleInfo, DbError> {
    let config: EventRuleConfig = serde_json::from_str(&row.config)
        .map_err(|e| DbError::Validation(format!("invalid event_rule config {}: {e}", row.id)))?;
    Ok(EventRuleInfo {
        id: row.id,
        name: row.name,
        enabled: row.enabled,
        priority: row.priority,
        builtin_key: row.builtin_key,
        creator_kind: row.creator_kind,
        creator_conversation_id: row.creator_conversation_id,
        config,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

pub async fn list(db: &DatabaseConnection) -> Result<Vec<EventRuleInfo>, DbError> {
    let rows = event_rule::Entity::find()
        .order_by_desc(event_rule::Column::Priority)
        .order_by_asc(event_rule::Column::Id)
        .all(db)
        .await?;
    rows.into_iter().map(to_info).collect()
}

pub async fn get(db: &DatabaseConnection, id: i32) -> Result<EventRuleInfo, DbError> {
    let row = event_rule::Entity::find_by_id(id)
        .one(db)
        .await?
        .ok_or(DbError::NotFound(format!("event_rule {id}")))?;
    to_info(row)
}

pub async fn create(
    db: &DatabaseConnection,
    draft: EventRuleDraft,
) -> Result<EventRuleInfo, DbError> {
    draft.config.validate().map_err(DbError::Validation)?;
    let creator_kind = draft.creator_kind.unwrap_or_else(|| "user".into());
    if !matches!(creator_kind.as_str(), "user" | "agent" | "builtin") {
        return Err(DbError::Validation(
            "creator_kind must be user, agent, or builtin".into(),
        ));
    }
    let now = Utc::now();
    let row = event_rule::ActiveModel {
        name: Set(draft.name),
        enabled: Set(draft.enabled),
        priority: Set(draft.priority),
        builtin_key: Set(None),
        creator_kind: Set(creator_kind),
        creator_conversation_id: Set(draft.creator_conversation_id),
        config: Set(
            serde_json::to_string(&draft.config).map_err(|e| DbError::Validation(e.to_string()))?
        ),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(db)
    .await?;
    to_info(row)
}

pub async fn update(
    db: &DatabaseConnection,
    id: i32,
    draft: EventRuleDraft,
) -> Result<EventRuleInfo, DbError> {
    draft.config.validate().map_err(DbError::Validation)?;
    let existing = event_rule::Entity::find_by_id(id)
        .one(db)
        .await?
        .ok_or(DbError::NotFound(format!("event_rule {id}")))?;
    let now = Utc::now();
    let mut active: event_rule::ActiveModel = existing.into();
    active.name = Set(draft.name);
    active.enabled = Set(draft.enabled);
    active.priority = Set(draft.priority);
    active.config =
        Set(serde_json::to_string(&draft.config).map_err(|e| DbError::Validation(e.to_string()))?);
    active.updated_at = Set(now);
    let row = active.update(db).await?;
    to_info(row)
}

pub async fn set_enabled(
    db: &DatabaseConnection,
    id: i32,
    enabled: bool,
) -> Result<EventRuleInfo, DbError> {
    let existing = event_rule::Entity::find_by_id(id)
        .one(db)
        .await?
        .ok_or(DbError::NotFound(format!("event_rule {id}")))?;
    let mut active: event_rule::ActiveModel = existing.into();
    active.enabled = Set(enabled);
    active.updated_at = Set(Utc::now());
    let row = active.update(db).await?;
    to_info(row)
}

pub async fn delete(db: &DatabaseConnection, id: i32) -> Result<(), DbError> {
    let result = event_rule::Entity::delete_by_id(id).exec(db).await?;
    if result.rows_affected == 0 {
        return Err(DbError::NotFound(format!("event_rule {id}")));
    }
    Ok(())
}

/// Clear per-rule attempt counters after a successful turn so `max_attempts`
/// applies to one continuous failure chain, not the conversation lifetime.
pub async fn reset_attempts_for_conversation(
    db: &DatabaseConnection,
    conversation_id: i32,
) -> Result<(), DbError> {
    event_rule_attempt::Entity::delete_many()
        .filter(event_rule_attempt::Column::ConversationId.eq(conversation_id))
        .exec(db)
        .await?;
    Ok(())
}

pub async fn list_enabled_rules(db: &DatabaseConnection) -> Result<Vec<ParsedEventRule>, DbError> {
    let rows = event_rule::Entity::find()
        .filter(event_rule::Column::Enabled.eq(true))
        .order_by_desc(event_rule::Column::Priority)
        .order_by_asc(event_rule::Column::Id)
        .all(db)
        .await?;
    let mut out = Vec::new();
    for row in rows {
        let config: EventRuleConfig = serde_json::from_str(&row.config).map_err(|e| {
            DbError::Validation(format!("invalid event_rule config {}: {e}", row.id))
        })?;
        if let Err(e) = config.validate() {
            tracing::warn!("[event_rules] skip rule {}: {e}", row.id);
            continue;
        }
        out.push(ParsedEventRule {
            id: row.id,
            name: row.name,
            priority: row.priority,
            config,
        });
    }
    Ok(out)
}

pub async fn reserve_attempt(
    db: &DatabaseConnection,
    rule_id: i32,
    conversation_id: i32,
    max_attempts: u32,
    cooldown_ms: u64,
) -> Result<GuardDecision, DbError> {
    let txn = db.begin().await?;
    let now = Utc::now();
    let mut existing = event_rule_attempt::Entity::find_by_id((rule_id, conversation_id))
        .one(&txn)
        .await?;

    if let Some(row) = &existing {
        if let Some(last) = row.last_fired_at {
            let elapsed = now.signed_duration_since(last);
            if elapsed > ATTEMPT_CHAIN_IDLE_RESET {
                event_rule_attempt::Entity::delete_by_id((rule_id, conversation_id))
                    .exec(&txn)
                    .await?;
                existing = None;
            } else if elapsed < Duration::milliseconds(cooldown_ms as i64) {
                txn.rollback().await?;
                return Ok(GuardDecision::Cooldown);
            }
        }
        if let Some(row) = &existing {
            if row.attempt_count >= max_attempts as i32 {
                txn.rollback().await?;
                return Ok(GuardDecision::MaxAttempts);
            }
        }
    }

    let next_count = existing.as_ref().map(|r| r.attempt_count + 1).unwrap_or(1);
    if let Some(row) = existing {
        let mut model: event_rule_attempt::ActiveModel = row.into();
        model.attempt_count = Set(next_count);
        model.last_fired_at = Set(Some(now));
        model.update(&txn).await?;
    } else {
        event_rule_attempt::ActiveModel {
            rule_id: Set(rule_id),
            conversation_id: Set(conversation_id),
            attempt_count: Set(next_count),
            last_fired_at: Set(Some(now)),
            ..Default::default()
        }
        .insert(&txn)
        .await?;
    }
    txn.commit().await?;
    Ok(GuardDecision::Allowed)
}

pub async fn append_log(
    db: &DatabaseConnection,
    rule_id: i32,
    conversation_id: i32,
    kind: &str,
    detail: Option<String>,
) -> Result<(), DbError> {
    let model = event_rule_log::ActiveModel {
        rule_id: Set(rule_id),
        conversation_id: Set(conversation_id),
        kind: Set(kind.to_string()),
        detail: Set(detail),
        source_conversation_id: Set(None),
        resolved_target_id: Set(None),
        trigger: Set(None),
        action: Set(None),
        prompt_snapshot: Set(None),
        guard_reason: Set(None),
        created_at: Set(Utc::now()),
        ..Default::default()
    };
    model.insert(db).await?;
    Ok(())
}

pub async fn append_execution_log(
    db: &DatabaseConnection,
    log: ExecutionLogDraft,
) -> Result<(), DbError> {
    event_rule_log::ActiveModel {
        rule_id: Set(log.rule_id),
        conversation_id: Set(log.source_conversation_id),
        kind: Set(log.status.to_string()),
        detail: Set(log.detail),
        source_conversation_id: Set(Some(log.source_conversation_id)),
        resolved_target_id: Set(log.resolved_target_id),
        trigger: Set(Some(log.trigger.to_string())),
        action: Set(Some(log.action.to_string())),
        prompt_snapshot: Set(Some(log.prompt_snapshot)),
        guard_reason: Set(log.guard_reason.map(str::to_string)),
        created_at: Set(Utc::now()),
        ..Default::default()
    }
    .insert(db)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_helpers::{fresh_in_memory_db, seed_conversation, seed_folder};
    use crate::event_rules::types::{
        ActionKind, AutomationType, ConditionKind, ContainsMatchMode, ConversationRef,
        LifecycleTrigger, RuleAction, RuleCondition, RuleGuard,
    };
    use crate::models::agent::AgentType;

    async fn seed_rule(db: &crate::db::AppDatabase) -> i32 {
        let config = EventRuleConfig {
            automation_type: AutomationType::ContentDetection,
            scope: Default::default(),
            trigger: LifecycleTrigger::TurnFailed,
            condition: RuleCondition {
                kind: ConditionKind::None,
                source: Default::default(),
                match_mode: ContainsMatchMode::All,
                text_contains: vec![],
                regex: None,
                error_kind: None,
                error_severity: None,
                error_title: None,
                error_details: None,
            },
            action: RuleAction {
                kind: ActionKind::SendToConversation,
                conversation_ref: ConversationRef::SourceConversation,
                conversation_id: None,
                prompt: "继续".into(),
                target_conversation_ids: vec![],
                include_source_context: false,
                include_recent_user_message: false,
                include_final_report: false,
                additional_prompt: None,
                recent_user_message_ignore_rules: vec![],
            },
            guard: RuleGuard {
                max_attempts: 3,
                cooldown_ms: 5000,
            },
        };
        let now = Utc::now();
        let row = event_rule::ActiveModel {
            name: Set("test".into()),
            enabled: Set(true),
            priority: Set(0),
            builtin_key: Set(None),
            config: Set(serde_json::to_string(&config).unwrap()),
            created_at: Set(now),
            updated_at: Set(now),
            ..Default::default()
        }
        .insert(&db.conn)
        .await
        .expect("insert rule");
        row.id
    }

    #[tokio::test]
    async fn max_attempts_blocks_fourth_fire() {
        let db = fresh_in_memory_db().await;
        let folder_id = seed_folder(&db, "/tmp/event-rules").await;
        let conv_id = seed_conversation(&db, folder_id, AgentType::Cursor).await;
        let rule_id = seed_rule(&db).await;

        for _ in 0..3 {
            assert_eq!(
                reserve_attempt(&db.conn, rule_id, conv_id, 3, 0)
                    .await
                    .unwrap(),
                GuardDecision::Allowed
            );
        }
        assert_eq!(
            reserve_attempt(&db.conn, rule_id, conv_id, 3, 0)
                .await
                .unwrap(),
            GuardDecision::MaxAttempts
        );
    }

    #[tokio::test]
    async fn cooldown_blocks_immediate_repeat() {
        let db = fresh_in_memory_db().await;
        let folder_id = seed_folder(&db, "/tmp/event-rules-cd").await;
        let conv_id = seed_conversation(&db, folder_id, AgentType::Cursor).await;
        let rule_id = seed_rule(&db).await;

        assert_eq!(
            reserve_attempt(&db.conn, rule_id, conv_id, 10, 60_000)
                .await
                .unwrap(),
            GuardDecision::Allowed
        );
        assert_eq!(
            reserve_attempt(&db.conn, rule_id, conv_id, 10, 60_000)
                .await
                .unwrap(),
            GuardDecision::Cooldown
        );
    }
}
