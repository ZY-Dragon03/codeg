//! Event-driven automation rule types (Phase 1 lifecycle rules).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LifecycleTrigger {
    TurnFailed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConditionKind {
    None,
    Contains,
    Regex,
    ErrorKind,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ContainsMatchMode {
    #[default]
    All,
    Any,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuleCondition {
    pub kind: ConditionKind,
    #[serde(default)]
    pub match_mode: ContainsMatchMode,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub text_contains: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub regex: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_kind: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionKind {
    SendToConversation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConversationRef {
    SourceConversation,
    SpecificConversation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuleAction {
    pub kind: ActionKind,
    pub conversation_ref: ConversationRef,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub conversation_id: Option<i32>,
    pub prompt: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuleGuard {
    #[serde(default = "default_max_attempts")]
    pub max_attempts: u32,
    #[serde(default = "default_cooldown_ms")]
    pub cooldown_ms: u64,
}

fn default_max_attempts() -> u32 {
    3
}

fn default_cooldown_ms() -> u64 {
    5000
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EventRuleConfig {
    pub trigger: LifecycleTrigger,
    pub condition: RuleCondition,
    pub action: RuleAction,
    pub guard: RuleGuard,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LifecycleEvent {
    pub connection_id: String,
    pub conversation_id: i32,
    pub folder_id: i32,
    pub agent_type: String,
    pub trigger: LifecycleTrigger,
    pub error_kind: Option<String>,
    pub text: String,
    /// ACP session id for the failed turn (`TurnComplete.session_id`).
    pub turn_session_id: String,
    /// AIR `SessionFailureRecord.id` when present.
    pub failure_record_id: Option<String>,
    /// Dedup key for the same terminal failure notification.
    pub dedup_key: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedEventRule {
    pub id: i32,
    pub name: String,
    pub priority: i32,
    pub config: EventRuleConfig,
}

impl EventRuleConfig {
    pub fn validate(&self) -> Result<(), String> {
        if !matches!(self.action.kind, ActionKind::SendToConversation) {
            return Err("only send_to_conversation is supported in phase 1".into());
        }
        if matches!(self.action.conversation_ref, ConversationRef::SpecificConversation)
            && self.action.conversation_id.is_none()
        {
            return Err("specific_conversation requires conversation_id".into());
        }
        if self.action.prompt.trim().is_empty() {
            return Err("action prompt must not be empty".into());
        }
        if matches!(self.condition.kind, ConditionKind::Regex)
            && self
                .condition
                .regex
                .as_ref()
                .is_none_or(|r| r.trim().is_empty())
        {
            return Err("regex condition requires regex".into());
        }
        if matches!(self.condition.kind, ConditionKind::ErrorKind)
            && self
                .condition
                .error_kind
                .as_ref()
                .is_none_or(|k| k.trim().is_empty())
        {
            return Err("error_kind condition requires error_kind".into());
        }
        if self.guard.max_attempts == 0 {
            return Err("max_attempts must be >= 1".into());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_rejects_empty_prompt() {
        let cfg = EventRuleConfig {
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
                prompt: "  ".into(),
            },
            guard: RuleGuard {
                max_attempts: 3,
                cooldown_ms: 5000,
            },
        };
        assert!(cfg.validate().is_err());
    }

    #[test]
    fn validate_rejects_specific_conversation_without_id() {
        let cfg = EventRuleConfig {
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
                conversation_ref: ConversationRef::SpecificConversation,
                conversation_id: None,
                prompt: "继续".into(),
            },
            guard: RuleGuard {
                max_attempts: 3,
                cooldown_ms: 5000,
            },
        };
        assert!(cfg.validate().is_err());
    }
}
