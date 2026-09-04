//! Condition matching for lifecycle event rules.

use regex::Regex;

use super::types::{
    ConditionKind, ContainsMatchMode, LifecycleEvent, ParsedEventRule, RuleCondition,
};

pub fn match_rules<'a>(
    rules: &'a [ParsedEventRule],
    event: &LifecycleEvent,
) -> Vec<&'a ParsedEventRule> {
    rules
        .iter()
        .filter(|rule| rule.config.trigger == event.trigger)
        .filter(|rule| condition_matches(&rule.config.condition, event))
        .collect()
}

pub fn condition_matches(condition: &RuleCondition, event: &LifecycleEvent) -> bool {
    match condition.kind {
        ConditionKind::None => true,
        ConditionKind::Contains => contains_matches(condition, &event.text),
        ConditionKind::Regex => regex_matches(condition, &event.text),
        ConditionKind::ErrorKind => error_kind_matches(condition, event.error_kind.as_deref()),
    }
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
        ActionKind, ConversationRef, EventRuleConfig, LifecycleTrigger, RuleAction, RuleGuard,
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
                trigger: LifecycleTrigger::TurnFailed,
                condition,
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
        }
    }

    #[test]
    fn contains_any_matches_retriable_tls() {
        let condition = RuleCondition {
            kind: ConditionKind::Contains,
            match_mode: ContainsMatchMode::Any,
            text_contains: vec!["RetriableError".into(), "TLS".into()],
            regex: None,
            error_kind: None,
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
            match_mode: ContainsMatchMode::All,
            text_contains: vec!["RetriableError".into(), "TLS".into()],
            regex: None,
            error_kind: None,
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
            match_mode: ContainsMatchMode::All,
            text_contains: vec![],
            regex: Some(r"RetriableError.*TLS".into()),
            error_kind: None,
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
            match_mode: ContainsMatchMode::All,
            text_contains: vec![],
            regex: None,
            error_kind: Some("connection".into()),
        };
        assert!(condition_matches(
            &condition,
            &tls_event("anything")
        ));
        let mut ev = tls_event("x");
        ev.error_kind = Some("access".into());
        assert!(!condition_matches(&condition, &ev));
    }

    #[test]
    fn none_condition_always_matches() {
        let condition = RuleCondition {
            kind: ConditionKind::None,
            match_mode: ContainsMatchMode::All,
            text_contains: vec![],
            regex: None,
            error_kind: None,
        };
        assert!(condition_matches(&condition, &tls_event("")));
    }
}
