//! Read-only unified projection for saved event rules and persistent wakes.
//! The projection deliberately keeps both source tables authoritative.

use chrono::{DateTime, Utc};
use sea_orm::{DatabaseConnection, EntityTrait, QueryOrder};
use serde::Serialize;

use crate::db::entities::{agent_wake, event_rule};
use crate::db::error::DbError;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AutomationRegistryItem {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub status: String,
    pub enabled: bool,
    pub creator_kind: String,
    pub creator_id: Option<String>,
    pub target_conversation_id: Option<i32>,
    pub trigger_kind: String,
    pub fire_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub error: Option<String>,
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
        .chain(wakes.into_iter().map(wake_item))
        .collect::<Vec<_>>();
    result.sort_by(|a, b| b.created_at.cmp(&a.created_at).then(a.id.cmp(&b.id)));
    Ok(result)
}

fn rule_item(row: event_rule::Model) -> AutomationRegistryItem {
    AutomationRegistryItem {
        id: format!("event_rule:{}", row.id),
        kind: "event_rule".into(),
        name: row.name,
        status: if row.enabled { "enabled" } else { "disabled" }.into(),
        enabled: row.enabled,
        creator_kind: if row.builtin_key.is_some() {
            "system".into()
        } else {
            "user".into()
        },
        creator_id: row.builtin_key,
        target_conversation_id: None,
        trigger_kind: "lifecycle_event".into(),
        fire_at: None,
        created_at: row.created_at,
        updated_at: row.updated_at,
        error: None,
    }
}

fn wake_item(row: agent_wake::Model) -> AutomationRegistryItem {
    AutomationRegistryItem {
        id: format!("wake:{}", row.id),
        kind: "wake".into(),
        name: row.prompt.clone(),
        status: row.status.clone(),
        enabled: row.status == "pending" || row.status == "dispatching",
        creator_kind: row.creator_kind,
        creator_id: row.creator_id,
        target_conversation_id: Some(row.source_conversation_id),
        trigger_kind: row.trigger_kind,
        fire_at: row.fire_at,
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
    async fn projection_contains_rules_and_wakes_without_copying_storage() {
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
                fire_at: Some(Utc::now()),
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
    }
}
