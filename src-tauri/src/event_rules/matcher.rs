//! Condition matching for lifecycle event rules.

use regex::Regex;

use super::types::{
    ConditionKind, ContentSource, ContainsMatchMode, LifecycleEvent, ParsedEventRule,
    RuleCondition, RuleScope,
};

pub fn match_rules<'a>(
    rules: &'a [ParsedEventRule],
    event: &LifecycleEvent,
) -> Vec<&'a ParsedEventRule> {
    rules
        .iter()
        .filter(|rule| rule.config.trigger == event.trigger)
        .filter(|rule| scope_matches(&rule.config.scope, event))
        .filter(|rule| condition_matches(&rule.config.condition, event))
        .collect()
}

pub fn scope_matches(scope: &RuleScope, event: &LifecycleEvent) -> bool {
    match scope {
        RuleScope::Global => true,
        RuleScope::Conversation { conversation_id } => *conversation_id == event.conversation_id,
        RuleScope::Folder { folder_id } => *folder_id == event.folder_id,
        RuleScope::AgentType { agent_type } => agent_type.eq_ignore_ascii_case(&event.agent_type),
    }
}

pub fn condition_matches(condition: &RuleCondition, event: &LifecycleEvent) -> bool {
    if matches!(condition.source, ContentSource::Error)
        && event.error_kind.is_none()
        && matches!(event.trigger, super::types::LifecycleTrigger::ContentMatched)
    {
        return false;
    }
    let source_text = match condition.source {
        ContentSource::AiOutput => event
            .assistant_text
            .as_deref()
            .unwrap_or_else(|| event.text.as_str()),
        ContentSource::Error => event.error_text.as_deref().unwrap_or_default(),
        ContentSource::Both => event.text.as_str(),
    };
    match condition.kind {
        ConditionKind::None => true,
        ConditionKind::Contains => contains_matches(condition, source_text),
        ConditionKind::Regex => regex_matches(condition, source_text),
        ConditionKind::ErrorKind => {
            error_kind_matches(condition, event.error_kind.as_deref())
                || (matches!(condition.source, ContentSource::Error | ContentSource::Both)
                    && structured_error_matches(condition, event))
                || error_text_matches(condition, source_text)
        }
    }
}

fn structured_error_matches(condition: &RuleCondition, event: &LifecycleEvent) -> bool {
    let expected = [
        condition.error_severity.as_deref(),
        condition.error_title.as_deref(),
        condition.error_details.as_deref(),
    ]
    .into_iter()
    .flatten()
    .filter(|value| !value.trim().is_empty())
    .collect::<Vec<_>>();
    if expected.is_empty() {
        return false;
    }
    let haystack = [
        event.error_severity.as_deref(),
        event.error_title.as_deref(),
        event.error_details.as_deref(),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join("\n")
    .to_ascii_lowercase();
    expected
        .into_iter()
        .all(|needle| haystack.contains(&needle.to_ascii_lowercase()))
}

fn error_text_matches(condition: &RuleCondition, haystack: &str) -> bool {
    let needles = [
        condition.error_severity.as_deref(),
        condition.error_title.as_deref(),
        condition.error_details.as_deref(),
    ]
    .into_iter()
    .flatten()
    .filter(|value| !value.trim().is_empty())
    .collect::<Vec<_>>();
    if needles.is_empty() {
        return false;
    }
    let hay = haystack.to_ascii_lowercase();
    needles
        .into_iter()
        .all(|needle| hay.contains(&needle.to_ascii_lowercase()))
}

fn contains_matches(condition: &RuleCondition, haystack: &str) -> bool {
    if condition.text_contains.is_empty() {
        return true;
    }
    let hay = haystack.to_ascii_lowercase();
    let needles: Vec<String> = condition
        .text_contains
        .iter()
        .map(|s| s.to_ascii_lowercase())
        .collect();
    match condition.match_mode {
        ContainsMatchMode::All => needles.iter().all(|n| hay.contains(n)),
        ContainsMatchMode::Any => needles.iter().any(|n| hay.contains(n)),
    }
}

fn regex_matches(condition: &RuleCondition, haystack: &str) -> bool {
    let Some(pattern) = condition.regex.as_deref() else {
        return false;
    };
    Regex::new(pattern)
        .map(|re| re.is_match(haystack))
        .unwrap_or(false)
}

fn error_kind_matches(condition: &RuleCondition, actual: Option<&str>) -> bool {
    let Some(expected) = condition.error_kind.as_deref() else {
        return false;
    };
    actual.is_some_and(|k| k.eq_ignore_ascii_case(expected))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event_rules::types::{
        ActionKind, AutomationType, ConversationRef, EventRuleConfig, LifecycleTrigger,
        RuleAction, RuleGuard,
    };

    fn tls_event(text: &str) -> LifecycleEvent {
        LifecycleEvent {
            connection_id: "c1".into(),
            conversation_id: 1,
            folder_id: 1,
            agent_type: "cursor".into(),
            trigger: LifecycleTrigger::TurnFailed,
            error_kind: Some("connection".into()),
            text: text.into(),
            assistant_text: None,
            error_text: None,
            error_severity: None,
            error_title: None,
            error_details: None,
            recent_user_message: None,
            recent_user_messages: Vec::new(),
            turn_session_id: "sess-1".into(),
            failure_record_id: Some("fail-1".into()),
            dedup_key: "k1".into(),
        }
    }

    fn sample_rule(condition: RuleCondition) -> ParsedEventRule {
        ParsedEventRule {
            id: 1,
            name: "test".into(),
            priority: 0,
            config: EventRuleConfig {
                automation_type: AutomationType::ContentDetection,
                scope: Default::default(),
                trigger: LifecycleTrigger::TurnFailed,
                condition,
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
            },
        }
    }

    #[test]
    fn contains_any_matches_retriable_tls() {
        let condition = RuleCondition {
            kind: ConditionKind::Contains,
            source: ContentSource::AiOutput,
            match_mode: ContainsMatchMode::Any,
            text_contains: vec!["RetriableError".into(), "TLS".into()],
            regex: None,
            error_kind: None,
            error_severity: None,
            error_title: None,
            error_details: None,
        };
        let event = tls_event(
            "Error: RetriableError: [aborted] Client network socket disconnected before secure TLS connection was established",
        );
        let rules = [sample_rule(condition)];
        let hits = match_rules(&rules, &event);
        assert_eq!(hits.len(), 1);
    }

    #[test]
    fn contains_all_requires_every_token() {
        let condition = RuleCondition {
            kind: ConditionKind::Contains,
            source: ContentSource::AiOutput,
            match_mode: ContainsMatchMode::All,
            text_contains: vec!["RetriableError".into(), "TLS".into()],
            regex: None,
            error_kind: None,
            error_severity: None,
            error_title: None,
            error_details: None,
        };
        assert!(!condition_matches(
            &condition,
            &tls_event("RetriableError only")
        ));
        assert!(condition_matches(
            &condition,
            &tls_event("RetriableError and TLS failure")
        ));
    }

    #[test]
    fn regex_matches_tls_socket_message() {
        let condition = RuleCondition {
            kind: ConditionKind::Regex,
            source: ContentSource::AiOutput,
            match_mode: ContainsMatchMode::All,
            text_contains: vec![],
            regex: Some(r"RetriableError.*TLS".into()),
            error_kind: None,
            error_severity: None,
            error_title: None,
            error_details: None,
        };
        assert!(condition_matches(
            &condition,
            &tls_event("RetriableError: TLS handshake failed")
        ));
    }

    #[test]
    fn error_kind_matches_connection_category() {
        let condition = RuleCondition {
            kind: ConditionKind::ErrorKind,
            source: ContentSource::AiOutput,
            match_mode: ContainsMatchMode::All,
            text_contains: vec![],
            regex: None,
            error_kind: Some("connection".into()),
            error_severity: None,
            error_title: None,
            error_details: None,
        };
        assert!(condition_matches(&condition, &tls_event("anything")));
        let mut ev = tls_event("x");
        ev.error_kind = Some("access".into());
        assert!(!condition_matches(&condition, &ev));
    }

    #[test]
    fn none_condition_always_matches() {
        let condition = RuleCondition {
            kind: ConditionKind::None,
            source: ContentSource::AiOutput,
            match_mode: ContainsMatchMode::All,
            text_contains: vec![],
            regex: None,
            error_kind: None,
            error_severity: None,
            error_title: None,
            error_details: None,
        };
        assert!(condition_matches(&condition, &tls_event("")));
    }
}
