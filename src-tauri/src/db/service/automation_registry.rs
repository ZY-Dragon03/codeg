//! Read-only unified projection for saved event rules and persistent wakes.
//! The source tables remain authoritative; this projection only joins their
//! user-facing fields for the Automation Registry.

use chrono::{DateTime, Utc};
use sea_orm::{DatabaseConnection, EntityTrait, QueryOrder};
use serde::Serialize;

use crate::db::entities::{agent_wake, event_rule};
use crate::db::error::DbError;
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
    pub target_conversation_id: Option<i32>,
    pub target: Option<String>,
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
    ProcessExit { process_id: Option<i32> },
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
        target_conversation_id: None,
        target: None,
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
                .fire_at
                .map(|at| (at - row.created_at).num_milliseconds().max(1))
                .unwrap_or(1),
        },
        crate::db::service::agent_wake_service::TRIGGER_AT => WakeSchedule::At {
            at: row.fire_at.unwrap_or(row.created_at),
        },
        _ => WakeSchedule::ProcessExit { process_id: None },
    }
}

fn wake_item(row: agent_wake::Model) -> AutomationRegistryItem {
    let provenance = row.creator_kind.clone();
    AutomationRegistryItem {
        id: row.id,
        item_type: "wake".into(),
        kind: "wake".into(),
        name: row.prompt.clone(),
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
        target_conversation_id: Some(row.source_conversation_id),
        target: Some(format!("conversation:{}", row.source_conversation_id)),
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
                prompt: "wake me".into(),
                creator_kind: "agent".into(),
                creator_id: Some("conn-1".into()),
            },
        )
        .await
        .unwrap();
        let items = list(&db.conn).await.unwrap();
        let wake = items.iter().find(|item| item.kind == "wake").unwrap();
        assert_eq!(wake.creator_kind, "agent");
        assert_eq!(wake.target_conversation_id, Some(conversation));
        assert_eq!(wake.item_type, "wake");
    }
}
