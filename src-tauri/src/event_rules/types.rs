//! Event-driven automation rule types (Phase 1 lifecycle rules).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum RuleScope {
    Global,
    Conversation { conversation_id: i32 },
    Folder { folder_id: i32 },
    AgentType { agent_type: String },
}

impl Default for RuleScope {
    fn default() -> Self {
        Self::Global
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LifecycleTrigger {
    TurnFailed,
    ContentMatched,
    TurnCompleted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum AutomationType {
    #[default]
    ContentDetection,
    ForwardAfterTaskCompletion,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ContentSource {
    #[default]
    AiOutput,
    Error,
    Both,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UserMessageIgnoreRule {
    pub kind: String,
    pub value: String,
}

fn default_recent_user_message_ignore_rules() -> Vec<UserMessageIgnoreRule> {
    vec![
        UserMessageIgnoreRule {
            kind: "exact".into(),
            value: "继续".into(),
        },
        UserMessageIgnoreRule {
            kind: "exact".into(),
            value: "continue".into(),
        },
    ]
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
    pub source: ContentSource,
    #[serde(default)]
    pub match_mode: ContainsMatchMode,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub text_contains: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub regex: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_severity: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_details: Option<String>,
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
    /// Additional existing conversation targets. The legacy conversation_ref
    /// fields remain the source-compatible single-target representation.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub target_conversation_ids: Vec<i32>,
    #[serde(default)]
    pub include_source_context: bool,
    #[serde(default)]
    pub include_recent_user_message: bool,
    #[serde(default)]
    pub include_final_report: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub additional_prompt: Option<String>,
    #[serde(
        default = "default_recent_user_message_ignore_rules",
        skip_serializing_if = "Vec::is_empty"
    )]
    pub recent_user_message_ignore_rules: Vec<UserMessageIgnoreRule>,
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
    #[serde(default)]
    pub automation_type: AutomationType,
    #[serde(default)]
    pub scope: RuleScope,
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
    /// Assistant-only text for content-source matching and report payloads.
    pub assistant_text: Option<String>,
    /// Error-only text for error-source matching.
    pub error_text: Option<String>,
    pub error_severity: Option<String>,
    pub error_title: Option<String>,
    pub error_details: Option<String>,
    /// The most recent valid user message for this settled turn, when one was
    /// observed on the lifecycle bus.
    pub recent_user_message: Option<String>,
    /// Candidate user messages in arrival order. The action selects the most
    /// recent one that does not match its configured ignore rules.
    pub recent_user_messages: Vec<String>,
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
        if let RuleScope::AgentType { agent_type } = &self.scope {
            if agent_type.trim().is_empty() {
                return Err("scope agent_type must not be empty".into());
            }
        }
        if !matches!(self.action.kind, ActionKind::SendToConversation) {
            return Err("only existing conversation forwarding is supported".into());
        }
        if matches!(
            self.action.conversation_ref,
            ConversationRef::SpecificConversation
        ) && self.action.conversation_id.is_none()
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
        if matches!(self.condition.kind, ConditionKind::Regex) {
            regex::Regex::new(self.condition.regex.as_deref().unwrap())
                .map_err(|e| format!("invalid regex: {e}"))?;
        }
        if matches!(self.condition.kind, ConditionKind::Contains)
            && (self.condition.text_contains.is_empty()
                || self
                    .condition
                    .text_contains
                    .iter()
                    .any(|k| k.trim().is_empty()))
        {
            return Err("contains requires non-empty keywords".into());
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
        for target in &self.action.target_conversation_ids {
            if *target <= 0 {
                return Err("target conversation ids must be positive".into());
            }
        }
        if matches!(self.automation_type, AutomationType::ForwardAfterTaskCompletion)
            && !matches!(self.trigger, LifecycleTrigger::TurnCompleted)
        {
            return Err("completion forwarding requires turn_completed trigger".into());
        }
        if self.guard.max_attempts == 0 {
            return Err("max_attempts must be >= 1".into());
        }
        if self.guard.cooldown_ms > 86_400_000 {
            return Err("cooldown_ms must be <= 86400000".into());
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
                prompt: "  ".into(),
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
        assert!(cfg.validate().is_err());
    }

    #[test]
    fn validate_rejects_specific_conversation_without_id() {
        let cfg = EventRuleConfig {
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
                conversation_ref: ConversationRef::SpecificConversation,
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
        assert!(cfg.validate().is_err());
    }
}
