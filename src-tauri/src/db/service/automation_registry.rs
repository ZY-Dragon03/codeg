//! Read-only unified projection for saved event rules and persistent wakes.
//! The source tables remain authoritative; this projection only joins their
//! user-facing fields for the Automation Registry.

use chrono::{DateTime, Utc};
use sea_orm::{DatabaseConnection, EntityTrait, QueryOrder};
use serde::Serialize;

use crate::db::entities::{agent_wake, event_rule};
use crate::db::error::DbError;
use crate::db::service::agent_wake_service;
use crate::event_rules::types::EventRuleConfig;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AutomationRegistryItem {
    pub id: i32,
    #[serde(rename = "type")]
    pub item_type: String,
    /// Stable alias retained for older Web clients.
    pub kind: String,
    pub name: String,
    pub status: String,
    pub enabled: bool,
    pub creator_kind: String,
    pub creator_id: Option<String>,
    pub provenance: String,
    pub creator: Option<String>,
    pub applicable: Option<bool>,
    pub priority: Option<i32>,
    pub config: Option<EventRuleConfig>,
    /// Persisted owner of a wake. This is separate from the legacy target
    /// alias so clients never have to infer which conversation scopes CRUD.
    pub source_conversation_id: Option<i32>,
    pub target_conversation_id: Option<i32>,
    pub target: Option<String>,
    pub target_mode: Option<String>,
    pub target_conversation_ids: Option<Vec<i32>>,
    pub trigger_kind: String,
    pub fire_at: Option<DateTime<Utc>>,
    pub schedule: Option<WakeSchedule>,
    pub prompt: Option<String>,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WakeSchedule {
    After { delay_ms: i64 },
    At { at: DateTime<Utc> },
    ProcessExit { process_id: Option<String> },
}

pub async fn list(db: &DatabaseConnection) -> Result<Vec<AutomationRegistryItem>, DbError> {
    let rules = event_rule::Entity::find()
        .order_by_desc(event_rule::Column::CreatedAt)
        .all(db)
        .await?;
    let wakes = agent_wake::Entity::find()
        .order_by_desc(agent_wake::Column::CreatedAt)
        .all(db)
        .await?;
    let mut result = rules
        .into_iter()
        .map(rule_item)
        .collect::<Result<Vec<_>, _>>()?;
    result.extend(wakes.into_iter().map(wake_item));
    result.sort_by(|a, b| b.created_at.cmp(&a.created_at).then(a.id.cmp(&b.id)));
    Ok(result)
}

fn rule_item(row: event_rule::Model) -> Result<AutomationRegistryItem, DbError> {
    let config = serde_json::from_str::<EventRuleConfig>(&row.config).map_err(|error| {
        DbError::Validation(format!("invalid event_rule config {}: {error}", row.id))
    })?;
    let provenance = if row.builtin_key.is_some() {
        "builtin".to_owned()
    } else {
        row.creator_kind.clone()
    };
    Ok(AutomationRegistryItem {
        id: row.id,
        item_type: "event_rule".into(),
        kind: "event_rule".into(),
        name: row.name,
        status: if row.enabled { "enabled" } else { "disabled" }.into(),
        enabled: row.enabled,
        creator_kind: provenance.clone(),
        creator_id: row
            .creator_conversation_id
            .map(|id| id.to_string())
            .or(row.builtin_key.clone()),
        provenance,
        creator: row.creator_conversation_id.map(|id| format!("agent:{id}")),
        applicable: None,
        priority: Some(row.priority),
        config: Some(config),
        source_conversation_id: None,
        target_conversation_id: None,
        target: None,
        target_mode: None,
        target_conversation_ids: None,
        trigger_kind: "lifecycle_event".into(),
        fire_at: None,
        schedule: None,
        prompt: None,
        description: None,
        created_at: row.created_at,
        updated_at: row.updated_at,
        error: None,
    })
}

fn wake_schedule(row: &agent_wake::Model) -> WakeSchedule {
    match row.trigger_kind.as_str() {
        crate::db::service::agent_wake_service::TRIGGER_AFTER => WakeSchedule::After {
            delay_ms: row
                .delay_ms
                .filter(|value| *value > 0)
                .unwrap_or_else(|| {
                    row.fire_at
                        .map(|at| (at - row.created_at).num_milliseconds().max(1))
                        .unwrap_or(1)
                }),
        },
        crate::db::service::agent_wake_service::TRIGGER_AT => WakeSchedule::At {
            at: row.fire_at.unwrap_or(row.created_at),
        },
        _ => WakeSchedule::ProcessExit {
            process_id: row
                .terminal_id
                .clone()
                .or_else(|| row.process_ref.clone()),
        },
    }
}

fn wake_display_name(row: &agent_wake::Model) -> String {
    if let Some(name) = row
        .display_name
        .as_ref()
        .filter(|value| !value.trim().is_empty())
    {
        return name.clone();
    }
    if row.creator_kind == "agent" {
        return row.prompt.clone();
    }
    format!("唤醒_{}", row.id)
}

fn wake_item(row: agent_wake::Model) -> AutomationRegistryItem {
    let provenance = row.creator_kind.clone();
    AutomationRegistryItem {
        id: row.id,
        item_type: "wake".into(),
        kind: "wake".into(),
        name: wake_display_name(&row),
        status: row.status.clone(),
        enabled: row.status == crate::db::service::agent_wake_service::STATUS_PENDING
            || row.status == crate::db::service::agent_wake_service::STATUS_DISPATCHING,
        creator_kind: provenance.clone(),
        creator_id: row.creator_id.clone(),
        provenance,
        creator: row.creator_id.as_ref().map(|id| format!("agent:{id}")),
        applicable: None,
        priority: None,
        config: None,
        source_conversation_id: Some(row.source_conversation_id),
        target_conversation_id: Some(row.source_conversation_id),
        target: Some(format!("conversation:{}", row.source_conversation_id)),
        target_mode: Some(row.target_mode.clone()),
        target_conversation_ids: agent_wake_service::target_ids(&row).ok(),
        trigger_kind: row.trigger_kind.clone(),
        fire_at: row.fire_at,
        schedule: Some(wake_schedule(&row)),
        prompt: Some(row.prompt),
        description: Some("one-shot wake".into()),
        created_at: row.created_at,
        updated_at: row.updated_at,
        error: row.error,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::service::agent_wake_service::{self, CreateWake, TRIGGER_AT};
    use crate::db::test_helpers::{fresh_in_memory_db, seed_conversation, seed_folder};
    use crate::models::agent::AgentType;

    #[tokio::test]
    async fn projection_contains_wakes_and_provenance() {
        let db = fresh_in_memory_db().await;
        let folder = seed_folder(&db, "/tmp/registry").await;
        let conversation = seed_conversation(&db, folder, AgentType::Cursor).await;
        agent_wake_service::create(
            &db.conn,
            CreateWake {
                source_conversation_id: conversation,
                source_connection_id: None,
                terminal_id: None,
                process_ref: None,
                trigger_kind: TRIGGER_AT.into(),
                fire_at: Some(Utc::now() + chrono::Duration::seconds(20)),
                delay_ms: None,
                target_mode: agent_wake_service::TARGET_MODE_CURRENT.into(),
                target_conversation_ids: vec![],
                prompt: "wake me".into(),
                display_name: None,
                creator_kind: "agent".into(),
                creator_id: Some("conn-1".into()),
            },
        )
        .await
        .unwrap();
        let items = list(&db.conn).await.unwrap();
        let wake = items.iter().find(|item| item.kind == "wake").unwrap();
        assert_eq!(wake.creator_kind, "agent");
        assert_eq!(wake.source_conversation_id, Some(conversation));
        assert_eq!(wake.target_conversation_id, Some(conversation));
        assert_eq!(wake.item_type, "wake");

        let json = serde_json::to_value(wake).unwrap();
        assert_eq!(json["type"], "wake");
        assert_eq!(json["sourceConversationId"], conversation);
        assert_eq!(json["targetConversationId"], conversation);
        assert!(json.get("source_conversation_id").is_none());
    }
}
