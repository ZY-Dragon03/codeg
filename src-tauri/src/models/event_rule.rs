use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::event_rules::types::EventRuleConfig;

/// Persisted lifecycle event rule. Wire form for list/get APIs.
#[derive(Debug, Clone, Serialize)]
pub struct EventRuleInfo {
    pub id: i32,
    pub name: String,
    pub enabled: bool,
    pub priority: i32,
    pub builtin_key: Option<String>,
    pub creator_kind: String,
    pub creator_conversation_id: Option<i32>,
    pub config: EventRuleConfig,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Create/update payload for event rules.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventRuleDraft {
    pub name: String,
    pub enabled: bool,
    pub priority: i32,
    pub config: EventRuleConfig,
    /// Agent-created rules carry the authenticated parent conversation. User
    /// clients omit these fields and are persisted as `user` provenance.
    #[serde(default)]
    pub creator_kind: Option<String>,
    #[serde(default)]
    pub creator_conversation_id: Option<i32>,
}
