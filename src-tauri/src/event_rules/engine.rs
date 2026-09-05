//! Event rules engine: subscribe to ACP bus, match rules, send follow-up prompts.

use std::collections::HashMap;
use regex::Regex;
use std::sync::Arc;
use std::time::{Duration, Instant};

use sea_orm::EntityTrait;
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::Mutex;

use crate::acp::manager::ConnectionManager;
use crate::acp::types::ConnectionStatus;
use crate::acp::types::{AcpEvent, EventEnvelope, PromptInputBlock, SessionFailureRecord};
use crate::acp::InternalEventBus;
use crate::db::service::conversation_service;
use crate::db::service::event_rule_service::{self, ExecutionLogDraft, GuardDecision};
use crate::db::AppDatabase;
use crate::event_rules::dedup::turn_failure_dedup_key;
use crate::event_rules::matcher::match_rules;
use crate::event_rules::types::{
    ActionKind, ConversationRef, LifecycleEvent, LifecycleTrigger,
    ParsedEventRule,
};
use crate::logging::throttle::{LagLogThrottle, LAG_LOG_WINDOW};

/// Suppress duplicate failure notifications for the same turn/error.
const DEDUP_TTL: Duration = Duration::from_secs(30);

/// TurnComplete persistence and the rule guard can reach SQLite together.
/// Reuse the lifecycle subscriber's bounded contention policy so a transient
/// writer does not silently drop an otherwise valid automation.
const GUARD_RETRY_BACKOFFS: &[Duration] =
    &[Duration::from_millis(100), Duration::from_millis(500)];

/// CRUD and startup reloads share the same bounded SQLite contention policy as
/// lifecycle writes. A failed reload must remain visible to its caller; the
/// retry only absorbs short-lived writer contention.
const RULE_RELOAD_RETRY_BACKOFFS: &[Duration] =
    &[Duration::from_millis(100), Duration::from_millis(500)];

/// Logs are written after a guard decision or prompt send. They get a bounded
/// retry so a transient SQLite lock does not erase the audit receipt, while a
/// final error is still emitted at ERROR when the action may already have run.
const EXECUTION_LOG_RETRY_BACKOFFS: &[Duration] =
    &[Duration::from_millis(100), Duration::from_millis(500)];

/// Pending failure signals are buffered until `TurnComplete` settles the turn.
/// `emit_with_state` applies `TurnComplete` (clearing `turn_in_flight`) before
/// broadcasting, so rule actions always run after the turn is settled.
struct PendingTurnFailure {
    /// Stable current-turn marker from SessionState. Unlike ACP session_id,
    /// this changes between turns in one persistent session.
    turn_marker: u64,
    conversation_id: i32,
    folder_id: i32,
    agent_type: String,
    error_kind: Option<String>,
    text: String,
    error_severity: Option<String>,
    error_title: Option<String>,
    error_details: Option<String>,
    /// Main-thread assistant output accumulated from ContentDelta. This is
    /// retained until TurnComplete so a streaming match can never dispatch
    /// before the connection is idle.
    assistant_text: String,
    /// The user prompt for the current turn, used by completion payloads.
    user_messages: Vec<String>,
    failure_record_id: Option<String>,
    /// True when a terminal AIR `SessionFailure` (severity `"error"`) was seen.
    terminal_failure: bool,
}

pub struct EventRulesEngine {
    db: AppDatabase,
    manager: ConnectionManager,
    bus: Arc<InternalEventBus>,
    rules: Mutex<Vec<ParsedEventRule>>,
    recent_dedup: Mutex<HashMap<String, Instant>>,
    pending_failures: Mutex<HashMap<String, PendingTurnFailure>>,
}

impl EventRulesEngine {
    pub fn new(db: AppDatabase, manager: ConnectionManager, bus: Arc<InternalEventBus>) -> Self {
        Self {
            db,
            manager,
            bus,
            rules: Mutex::new(Vec::new()),
            recent_dedup: Mutex::new(HashMap::new()),
            pending_failures: Mutex::new(HashMap::new()),
        }
    }

    pub async fn reload_rules(&self) -> Result<(), crate::db::error::DbError> {
        for attempt in 0..=RULE_RELOAD_RETRY_BACKOFFS.len() {
            match event_rule_service::list_enabled_rules(&self.db.conn).await {
                Ok(rules) => {
                    tracing::debug!("[event_rules] loaded {} enabled rule(s)", rules.len());
                    *self.rules.lock().await = rules;
                    return Ok(());
                }
                Err(error) if attempt < RULE_RELOAD_RETRY_BACKOFFS.len() => {
                    let backoff = RULE_RELOAD_RETRY_BACKOFFS[attempt];
                    tracing::warn!(
                        "[event_rules] reload failed (attempt {}, retrying in {}ms): {error}",
                        attempt + 1,
                        backoff.as_millis()
                    );
                    tokio::time::sleep(backoff).await;
                }
                Err(error) => {
                    tracing::error!(
                        "[event_rules] reload failed after {} attempts: {error}",
                        attempt + 1
                    );
                    return Err(error);
                }
            }
        }
        unreachable!("reload loop always returns")
    }

    pub async fn target_available(&self, conversation_id: i32) -> bool {
        self.manager
            .find_eligible_connection_by_conversation_id(conversation_id)
            .await
            .is_some()
    }

    #[cfg(any(test, feature = "test-utils"))]
    pub async fn enabled_rule_ids_for_test(&self) -> Vec<i32> {
        self.rules.lock().await.iter().map(|r| r.id).collect()
    }

    pub async fn run(self: Arc<Self>) {
        if let Err(error) = self.reload_rules().await {
            tracing::error!("[event_rules] initial rule load failed: {error}");
        }
        let mut rx = self.bus.subscribe();
        let mut lag_throttle = LagLogThrottle::new(LAG_LOG_WINDOW);
        loop {
            match rx.recv().await {
                Ok(env) => self.on_envelope(&env).await,
                Err(RecvError::Lagged(n)) => {
                    if let Some(s) = lag_throttle.record(n) {
                        tracing::warn!(
                            "[event_rules] event bus lagged: dropped {} events across {} occurrence(s)",
                            s.dropped,
                            s.occurrences
                        );
                    }
                }
                Err(RecvError::Closed) => break,
            }
        }
    }

    async fn on_envelope(self: &Arc<Self>, env: &EventEnvelope) {
        match &env.payload {
            AcpEvent::SessionFailure { record }
                if record.severity == "error" && !record.resolved =>
            {
                self.merge_session_failure(env, record).await;
            }
            AcpEvent::Error {
                message,
                code,
                details,
                ..
            } if is_turn_failure_error_code(code.as_deref()) => {
                self.merge_turn_error(env, message, code.as_deref(), details.as_deref())
                    .await;
            }
            AcpEvent::ContentDelta {
                text,
                parent_tool_use_id: None,
            } => {
                self.merge_assistant_delta(env, text).await;
            }
            AcpEvent::UserMessage { blocks, .. } => {
                self.merge_user_message(env, blocks).await;
            }
            AcpEvent::TurnComplete {
                session_id,
                stop_reason,
                ..
            } => {
                self.on_turn_complete(env, session_id, stop_reason).await;
            }
            _ => {}
        }
    }

    async fn merge_assistant_delta(&self, env: &EventEnvelope, text: &str) {
        if text.is_empty() {
            return;
        }
        let Some((conversation_id, folder_id, agent_type, turn_marker)) =
            self.resolve_conversation_context(&env.connection_id).await
        else {
            return;
        };
        let mut pending = self.pending_failures.lock().await;
        let entry = pending
            .entry(env.connection_id.clone())
            .or_insert_with(|| PendingTurnFailure {
                turn_marker,
                conversation_id,
                folder_id,
                agent_type: agent_type.clone(),
                error_kind: None,
                text: String::new(),
                error_severity: None,
                error_title: None,
                error_details: None,
                assistant_text: String::new(),
                user_messages: Vec::new(),
                failure_record_id: None,
                terminal_failure: false,
            });
        entry.turn_marker = turn_marker;
        entry.conversation_id = conversation_id;
        entry.folder_id = folder_id;
        entry.agent_type = agent_type;
        entry.assistant_text.push_str(text);
    }

    async fn merge_user_message(
        &self,
        env: &EventEnvelope,
        blocks: &[crate::acp::types::UserMessageBlock],
    ) {
        let Some((conversation_id, folder_id, agent_type, turn_marker)) =
            self.resolve_conversation_context(&env.connection_id).await
        else {
            return;
        };
        let message = blocks
            .iter()
            .filter_map(|block| match block {
                crate::acp::types::UserMessageBlock::Text { text } => Some(text.as_str()),
                crate::acp::types::UserMessageBlock::Image { .. } => None,
            })
            .collect::<Vec<_>>()
            .join("\n");
        if message.is_empty() {
            return;
        }
        let mut pending = self.pending_failures.lock().await;
        let entry = pending
            .entry(env.connection_id.clone())
            .or_insert_with(|| PendingTurnFailure {
                turn_marker,
                conversation_id,
                folder_id,
                agent_type: agent_type.clone(),
                error_kind: None,
                text: String::new(),
                error_severity: None,
                error_title: None,
                error_details: None,
                assistant_text: String::new(),
                user_messages: Vec::new(),
                failure_record_id: None,
                terminal_failure: false,
            });
        entry.user_messages.push(message);
    }

    async fn merge_session_failure(&self, env: &EventEnvelope, record: &SessionFailureRecord) {
        let Some((conversation_id, folder_id, agent_type, turn_marker)) =
            self.resolve_conversation_context(&env.connection_id).await
        else {
            return;
        };
        let text = failure_text(record);
        let mut pending = self.pending_failures.lock().await;
        let entry =
            pending
                .entry(env.connection_id.clone())
                .or_insert_with(|| PendingTurnFailure {
                    conversation_id,
                    turn_marker,
                    folder_id,
                    agent_type: agent_type.clone(),
                    error_kind: None,
                    text: String::new(),
                    error_severity: None,
                    error_title: None,
                    error_details: None,
                        assistant_text: String::new(),
                    user_messages: Vec::new(),
                    failure_record_id: None,
                    terminal_failure: false,
                });
        entry.conversation_id = conversation_id;
        entry.folder_id = folder_id;
        entry.agent_type = agent_type;
        entry.turn_marker = turn_marker;
        merge_error_kind(&mut entry.error_kind, Some(record.category.clone()));
        append_failure_text(&mut entry.text, &text);
        entry.failure_record_id = Some(record.id.clone());
        entry.error_severity = Some(record.severity.clone());
        append_optional_text(&mut entry.error_title, Some(&record.title));
        append_optional_text(&mut entry.error_details, record.details.as_deref());
        entry.terminal_failure = true;
    }

    async fn merge_turn_error(
        &self,
        env: &EventEnvelope,
        message: &str,
        code: Option<&str>,
        details: Option<&str>,
    ) {
        let Some((conversation_id, folder_id, agent_type, turn_marker)) =
            self.resolve_conversation_context(&env.connection_id).await
        else {
            return;
        };
        let kind = code
            .map(map_error_code_to_kind)
            .or_else(|| infer_kind_from_message(message));
        let text = error_text(message, details);
        let mut pending = self.pending_failures.lock().await;
        let entry =
            pending
                .entry(env.connection_id.clone())
                .or_insert_with(|| PendingTurnFailure {
                    conversation_id,
                    turn_marker,
                    folder_id,
                    agent_type: agent_type.clone(),
                    error_kind: None,
                    text: String::new(),
                    error_severity: None,
                    error_title: None,
                    error_details: None,
                        assistant_text: String::new(),
                    user_messages: Vec::new(),
                    failure_record_id: None,
                    terminal_failure: false,
                });
        entry.conversation_id = conversation_id;
        entry.folder_id = folder_id;
        entry.agent_type = agent_type;
        entry.turn_marker = turn_marker;
        merge_error_kind(&mut entry.error_kind, kind);
        append_failure_text(&mut entry.text, &text);
        append_optional_text(&mut entry.error_title, Some(message));
        append_optional_text(&mut entry.error_details, details);
        entry.terminal_failure = true;
    }

    async fn on_turn_complete(
        self: &Arc<Self>,
        env: &EventEnvelope,
        session_id: &str,
        stop_reason: &str,
    ) {
        let pending = self
            .pending_failures
            .lock()
            .await
            .remove(&env.connection_id);

        let Some(pending) = pending else {
            if stop_reason == "end_turn" {
                if let Some((conversation_id, folder_id, agent_type, turn_marker)) =
                    self.resolve_conversation_context(&env.connection_id).await
                {
                    let _ = event_rule_service::reset_attempts_for_conversation(
                        &self.db.conn,
                        conversation_id,
                    )
                    .await;
                    self.maybe_handle_lifecycle_event(LifecycleEvent {
                        connection_id: env.connection_id.clone(),
                        conversation_id,
                        folder_id,
                        agent_type,
                        trigger: LifecycleTrigger::TurnCompleted,
                        error_kind: None,
                        text: String::new(),
                        assistant_text: None,
                        error_text: None,
                        error_severity: None,
                        error_title: None,
                        error_details: None,
                        recent_user_message: None,
                        recent_user_messages: Vec::new(),
                        turn_session_id: format!("{session_id}#{turn_marker}"),
                        failure_record_id: None,
                        dedup_key: format!("turn_completed:{conversation_id}:{turn_marker}"),
                    })
                    .await;
                }
                return;
            }
            if !is_automatic_failure_stop_reason(stop_reason) {
                // User cancellation is not a turn failure and must never
                // synthesize an automatic recovery prompt.
                return;
            }
            let Some((conversation_id, folder_id, agent_type, turn_marker)) =
                self.resolve_conversation_context(&env.connection_id).await
            else {
                return;
            };
            let text = format!("turn failed: {stop_reason}");
            let event = LifecycleEvent {
                connection_id: env.connection_id.clone(),
                conversation_id,
                folder_id,
                agent_type,
                trigger: LifecycleTrigger::TurnFailed,
                error_kind: Some(map_stop_reason_to_kind(stop_reason)),
                text: text.clone(),
                assistant_text: None,
                error_text: Some(text.clone()),
                error_severity: None,
                error_title: Some(text.clone()),
                error_details: None,
                recent_user_message: None,
                recent_user_messages: Vec::new(),
                turn_session_id: format!("{session_id}#{turn_marker}"),
                failure_record_id: None,
                dedup_key: turn_failure_dedup_key(
                    conversation_id,
                    &format!("{session_id}#{turn_marker}"),
                    None,
                    &text,
                ),
            };
            self.maybe_handle_lifecycle_event(event).await;
            return;
        };

        if stop_reason == "end_turn" && !pending.terminal_failure {
            let completed_conversation_id = pending.conversation_id;
            let completed_turn_marker = pending.turn_marker;
            let completed_agent_type = pending.agent_type.clone();
            let completed_report = pending.assistant_text.clone();
            let _ = event_rule_service::reset_attempts_for_conversation(
                &self.db.conn,
                completed_conversation_id,
            )
            .await;
            let event = LifecycleEvent {
                connection_id: env.connection_id.clone(),
                conversation_id: completed_conversation_id,
                folder_id: pending.folder_id,
                agent_type: completed_agent_type,
                trigger: LifecycleTrigger::TurnCompleted,
                error_kind: None,
                text: completed_report,
                assistant_text: Some(pending.assistant_text.clone()).filter(|v| !v.trim().is_empty()),
                error_text: None,
                error_severity: None,
                error_title: None,
                error_details: None,
                recent_user_message: pending.user_messages.last().cloned().filter(|v| !v.trim().is_empty()),
                recent_user_messages: pending.user_messages.clone(),
                turn_session_id: format!("{session_id}#{completed_turn_marker}"),
                failure_record_id: None,
                dedup_key: format!(
                    "turn_completed:{}:{}",
                    completed_conversation_id, completed_turn_marker
                ),
            };
            if !event.text.trim().is_empty() {
                let mut content_event = event.clone();
                content_event.trigger = LifecycleTrigger::ContentMatched;
                content_event.dedup_key = format!(
                    "content_matched:{}:{}",
                    completed_conversation_id, completed_turn_marker
                );
                self.maybe_handle_lifecycle_event(content_event).await;
            }
            self.maybe_handle_lifecycle_event(event).await;
            return;
        }

        let event = LifecycleEvent {
            connection_id: env.connection_id.clone(),
            conversation_id: pending.conversation_id,
            folder_id: pending.folder_id,
            agent_type: pending.agent_type.clone(),
            trigger: LifecycleTrigger::TurnFailed,
            error_kind: pending.error_kind.clone(),
            text: if pending.assistant_text.is_empty() {
                pending.text.clone()
            } else if pending.text.is_empty() {
                pending.assistant_text.clone()
            } else {
                format!("{}\n{}", pending.text, pending.assistant_text)
            },
            assistant_text: Some(pending.assistant_text.clone()).filter(|v| !v.trim().is_empty()),
            error_text: Some(pending.text.clone()).filter(|v| !v.trim().is_empty()),
            error_severity: pending.error_severity.clone(),
            error_title: pending.error_title.clone(),
            error_details: pending.error_details.clone(),
            recent_user_message: pending.user_messages.last().cloned().filter(|v| !v.trim().is_empty()),
            recent_user_messages: pending.user_messages.clone(),
            turn_session_id: format!("{session_id}#{marker}", marker = pending.turn_marker),
            failure_record_id: pending.failure_record_id.clone(),
            dedup_key: turn_failure_dedup_key(
                pending.conversation_id,
                &format!("{session_id}#{marker}", marker = pending.turn_marker),
                pending.failure_record_id.as_deref(),
                &pending.text,
            ),
        };
        if !event.text.trim().is_empty() {
            let mut content_event = event.clone();
            content_event.trigger = LifecycleTrigger::ContentMatched;
            content_event.dedup_key = format!(
                "content_matched:{}:{}",
                pending.conversation_id, pending.turn_marker
            );
            self.maybe_handle_lifecycle_event(content_event).await;
        }
        self.maybe_handle_lifecycle_event(event).await;
    }

    async fn maybe_handle_lifecycle_event(self: &Arc<Self>, event: LifecycleEvent) {
        if self.is_duplicate(&event.dedup_key).await {
            tracing::debug!(
                "[event_rules] dedup skipped conversation {} key {}",
                event.conversation_id,
                event.dedup_key
            );
            return;
        }
        self.handle_lifecycle_event(event).await;
    }

    async fn resolve_conversation_context(
        &self,
        connection_id: &str,
    ) -> Option<(i32, i32, String, u64)> {
        let (state, _) = self.manager.get_state_and_emitter(connection_id).await?;
        let snap = state.read().await;
        let conversation_id = snap.conversation_id?;
        let agent_type = snap.agent_type.to_string();
        let turn_marker = snap.turns_completed;
        drop(snap);
        let row = conversation_service::get_by_id(&self.db.conn, conversation_id)
            .await
            .ok()?;
        Some((conversation_id, row.folder_id, agent_type, turn_marker))
    }

    async fn is_duplicate(&self, key: &str) -> bool {
        let mut map = self.recent_dedup.lock().await;
        let now = Instant::now();
        map.retain(|_, t| now.duration_since(*t) < DEDUP_TTL);
        if map.contains_key(key) {
            return true;
        }
        map.insert(key.to_string(), now);
        false
    }

    pub async fn handle_lifecycle_event(&self, event: LifecycleEvent) {
        let rules = self.rules.lock().await.clone();
        let matched = match_rules(&rules, &event);
        if matched.is_empty() {
            tracing::debug!(
                "[event_rules] no rule matched conversation {} trigger {:?}",
                event.conversation_id,
                event.trigger
            );
            return;
        }
        // first_match by priority (rules already sorted desc)
        let rule = matched[0];
        let guard = &rule.config.guard;
        let configured_target_id = match rule.config.action.conversation_ref {
            ConversationRef::SourceConversation => Some(event.conversation_id),
            ConversationRef::SpecificConversation => rule.config.action.conversation_id,
        };
        let trigger_name = lifecycle_trigger_name(&event.trigger);
        match self
            .reserve_attempt_with_retry(
                rule.id,
                event.conversation_id,
                guard.max_attempts,
                guard.cooldown_ms,
            )
            .await
        {
            Ok(GuardDecision::Allowed) => {}
            Ok(GuardDecision::Cooldown) => {
                self.append_execution_log_with_retry(ExecutionLogDraft {
                    rule_id: rule.id,
                    source_conversation_id: event.conversation_id,
                    resolved_target_id: configured_target_id,
                    status: "skipped",
                    detail: Some(format!("cooldown_ms={}", guard.cooldown_ms)),
                    trigger: trigger_name,
                    action: "send_to_conversation",
                    prompt_snapshot: rule.config.action.prompt.clone(),
                    guard_reason: Some("skipped_cooldown"),
                })
                .await;
                tracing::info!(
                    "[event_rules] rule {} skipped for conversation {} (cooldown)",
                    rule.id,
                    event.conversation_id
                );
                return;
            }
            Ok(GuardDecision::MaxAttempts) => {
                self.append_execution_log_with_retry(ExecutionLogDraft {
                    rule_id: rule.id,
                    source_conversation_id: event.conversation_id,
                    resolved_target_id: configured_target_id,
                    status: "skipped",
                    detail: Some(format!("max_attempts={}", guard.max_attempts)),
                    trigger: trigger_name,
                    action: "send_to_conversation",
                    prompt_snapshot: rule.config.action.prompt.clone(),
                    guard_reason: Some("skipped_max_attempts"),
                })
                .await;
                tracing::info!(
                    "[event_rules] rule {} reached max_attempts for conversation {}",
                    rule.id,
                    event.conversation_id
                );
                return;
            }
            Err(e) => {
                tracing::warn!("[event_rules] guard error: {e}");
                return;
            }
        }

        let mut targets = rule.config.action.target_conversation_ids.clone();
        if let Some(target) = configured_target_id {
            if !targets.contains(&target) {
                targets.insert(0, target);
            }
        }
        if targets.is_empty() {
            targets.push(event.conversation_id);
        }
        let prompt = render_action_prompt(&rule.config.action, &event);
        for target_id in targets {
            let result = self
                .execute_send_to_conversation(rule, &event, target_id)
                .await;
            let (status, detail) = match result {
                Ok(()) => ("fired", Some(event.text.chars().take(200).collect())),
                Err(error) => {
                    tracing::error!(
                        "[event_rules] rule {} failed for target {} in conversation {}: {}",
                        rule.id,
                        target_id,
                        event.conversation_id,
                        error
                    );
                    ("failed", Some(error))
                }
            };
            self.append_execution_log_with_retry(ExecutionLogDraft {
                rule_id: rule.id,
                source_conversation_id: event.conversation_id,
                resolved_target_id: Some(target_id),
                status,
                detail,
                trigger: trigger_name,
                action: "send_to_conversation",
                prompt_snapshot: prompt.clone(),
                guard_reason: None,
            })
            .await;
        }
        tracing::info!(
            "[event_rules] rule {} sent follow-up to conversation {}",
            rule.id,
            event.conversation_id
        );
    }

    async fn reserve_attempt_with_retry(
        &self,
        rule_id: i32,
        conversation_id: i32,
        max_attempts: u32,
        cooldown_ms: u64,
    ) -> Result<GuardDecision, crate::db::error::DbError> {
        let mut result = event_rule_service::reserve_attempt(
            &self.db.conn,
            rule_id,
            conversation_id,
            max_attempts,
            cooldown_ms,
        )
        .await;
        for (index, backoff) in GUARD_RETRY_BACKOFFS.iter().enumerate() {
            if result.is_ok() {
                break;
            }
            tracing::warn!(
                "[event_rules] guard reservation failed (attempt {}, retrying in {}ms): {}",
                index + 1,
                backoff.as_millis(),
                result.as_ref().expect_err("checked error")
            );
            tokio::time::sleep(*backoff).await;
            result = event_rule_service::reserve_attempt(
                &self.db.conn,
                rule_id,
                conversation_id,
                max_attempts,
                cooldown_ms,
            )
            .await;
        }
        result
    }

    async fn append_execution_log_with_retry(&self, log: ExecutionLogDraft) {
        let mut result = event_rule_service::append_execution_log(&self.db.conn, log.clone()).await;
        for (index, backoff) in EXECUTION_LOG_RETRY_BACKOFFS.iter().enumerate() {
            if result.is_ok() {
                return;
            }
            tracing::warn!(
                "[event_rules] execution log failed for {} (attempt {}, retrying in {}ms): {}",
                log.status,
                index + 1,
                backoff.as_millis(),
                result.as_ref().expect_err("checked error")
            );
            tokio::time::sleep(*backoff).await;
            result = event_rule_service::append_execution_log(&self.db.conn, log.clone()).await;
        }
        if let Err(error) = result {
            tracing::error!(
                "[event_rules] execution log failed after {} attempts for status {}; action may already have been sent: {}",
                EXECUTION_LOG_RETRY_BACKOFFS.len() + 1,
                log.status,
                error
            );
        }
    }

    async fn execute_send_to_conversation(
        &self,
        rule: &ParsedEventRule,
        event: &LifecycleEvent,
        target_id: i32,
    ) -> Result<(), String> {
        let action = &rule.config.action;
        if !matches!(action.kind, ActionKind::SendToConversation) {
            return Err("unsupported action".into());
        }
        let (conversation_id, folder_id) =
            resolve_conversation_target_id(&self.db.conn, target_id).await?;
        let prompt = render_action_prompt(action, event);
        let blocks = vec![PromptInputBlock::Text { text: prompt }];

        let conn_id = match action.conversation_ref {
            // A persistent conversation can temporarily have more than one
            // live ACP connection during reconnect/session preservation. The
            // source action must continue the exact turn that emitted the
            // lifecycle event rather than whichever connection the manager's
            // conversation lookup happens to return first.
            ConversationRef::SourceConversation if target_id == event.conversation_id => {
                event.connection_id.clone()
            }
            ConversationRef::SourceConversation | ConversationRef::SpecificConversation => {
                if let Some(id) = self
                    .manager
                    .find_eligible_connection_by_conversation_id(conversation_id)
                    .await
                {
                    id
                } else {
                    return Err(format!(
                        "no live connection for conversation {conversation_id}"
                    ));
                }
            }
        };

        // TurnComplete is applied before the bus delivers this event, so
        // `turn_in_flight` should already be clear. Guard anyway so a stray
        // direct `handle_lifecycle_event` test call cannot wedge the connection.
        if let Some(state) = self.manager.get_state(&conn_id).await {
            let snap = state.read().await;
            if snap.folder_id != Some(folder_id) || snap.conversation_id != Some(conversation_id) {
                return Err("live connection identity does not match target conversation".into());
            }
            if snap.turn_in_flight {
                return Err("turn still in flight; defer until TurnComplete".into());
            }
            if !matches!(snap.status, ConnectionStatus::Connected) {
                return Err(format!("connection is not live: {:?}", snap.status));
            }
        } else {
            return Err(format!(
                "connection for conversation {conversation_id} is offline"
            ));
        }

        self.manager
            .send_prompt_linked_with_message_id(
                &self.db,
                &conn_id,
                blocks,
                Some(folder_id),
                Some(conversation_id),
                None,
                None,
            )
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

fn is_automatic_failure_stop_reason(reason: &str) -> bool {
    matches!(reason, "unknown" | "empty" | "refusal" | "max_tokens" | "max_turn_requests")
}

async fn resolve_conversation_target_id(
    db: &sea_orm::DatabaseConnection,
    conversation_id: i32,
) -> Result<(i32, i32), String> {
    let target = crate::db::entities::conversation::Entity::find_by_id(conversation_id)
        .one(db)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("target conversation {conversation_id} not found"))?;
    if target.deleted_at.is_some() {
        return Err(format!("target conversation {conversation_id} is deleted"));
    }
    Ok((target.id, target.folder_id))
}

fn lifecycle_trigger_name(trigger: &LifecycleTrigger) -> &'static str {
    match trigger {
        LifecycleTrigger::TurnFailed => "turn_failed",
        LifecycleTrigger::ContentMatched => "content_matched",
        LifecycleTrigger::TurnCompleted => "turn_completed",
    }
}

fn render_action_prompt(
    action: &crate::event_rules::types::RuleAction,
    event: &LifecycleEvent,
) -> String {
    let mut sections = Vec::new();
    if action.include_source_context {
        sections.push(format!(
            "Source conversation: {} (folder {}, agent {})",
            event.conversation_id, event.folder_id, event.agent_type
        ));
    }
    if action.include_final_report && !event.text.trim().is_empty() {
        sections.push(format!("Agent report:\n{}", event.text.trim()));
    }
    if action.include_recent_user_message {
        if let Some(message) = find_recent_valid_user_message(
            &event.recent_user_messages,
            &action.recent_user_message_ignore_rules,
        ) {
            sections.push(format!("Recent valid user message:\n{}", message.trim()));
        }
    }
    if let Some(extra) = action.additional_prompt.as_deref().filter(|v| !v.trim().is_empty()) {
        sections.push(extra.trim().to_owned());
    }
    if sections.is_empty() {
        action.prompt.clone()
    } else if action.prompt.trim().is_empty() {
        sections.join("\n\n")
    } else {
        format!("{}\n\n{}", action.prompt.trim(), sections.join("\n\n"))
    }
}

fn find_recent_valid_user_message(
    messages: &[String],
    ignore_rules: &[crate::event_rules::types::UserMessageIgnoreRule],
) -> Option<String> {
    messages
        .iter()
        .rev()
        .map(|message| message.trim())
        .filter(|message| !message.is_empty())
        .find(|message| {
            !ignore_rules.iter().any(|rule| match rule.kind.to_ascii_lowercase().as_str() {
                "exact" => message == &rule.value.trim(),
                "contains" => message.contains(rule.value.trim()),
                "regex" => Regex::new(&rule.value).map(|re| re.is_match(message)).unwrap_or(false),
                _ => false,
            })
        })
        .map(str::to_owned)
}

fn failure_text(record: &SessionFailureRecord) -> String {
    error_text(&record.title, record.details.as_deref())
}

fn error_text(message: &str, details: Option<&str>) -> String {
    match details {
        Some(details) if !details.is_empty() && details != message => {
            format!("{message}\n{details}")
        }
        _ => message.to_owned(),
    }
}

fn append_failure_text(existing: &mut String, incoming: &str) {
    if incoming.is_empty() || existing.contains(incoming) {
        return;
    }
    if !existing.is_empty() {
        existing.push('\n');
    }
    existing.push_str(incoming);
}

fn append_optional_text(existing: &mut Option<String>, incoming: Option<&str>) {
    let Some(incoming) = incoming.filter(|value| !value.is_empty()) else {
        return;
    };
    match existing {
        None => *existing = Some(incoming.to_owned()),
        Some(current) if !current.contains(incoming) => {
            current.push('\n');
            current.push_str(incoming);
        }
        Some(_) => {}
    }
}

fn merge_error_kind(existing: &mut Option<String>, incoming: Option<String>) {
    let Some(incoming) = incoming.filter(|kind| !kind.is_empty()) else {
        return;
    };
    let incoming_unknown = incoming == "unknown";
    match existing.as_deref() {
        None => *existing = Some(incoming),
        Some("unknown") if !incoming_unknown => *existing = Some(incoming),
        Some(_) => {}
    }
}

fn is_turn_failure_error_code(code: Option<&str>) -> bool {
    code.is_some_and(|c| c.starts_with("turn_failed_"))
}

fn map_error_code_to_kind(code: &str) -> String {
    if code.contains("connection") || code.starts_with("turn_failed_empty") {
        "connection".into()
    } else if code.contains("refusal") {
        "request".into()
    } else if code.contains("max_tokens") || code.contains("max_turn") {
        "limit".into()
    } else {
        "unknown".into()
    }
}

fn map_stop_reason_to_kind(stop_reason: &str) -> String {
    match stop_reason {
        "refusal" => "request".into(),
        "max_tokens" | "max_turn_requests" => "limit".into(),
        "empty" | "unknown" => "connection".into(),
        _ => "unknown".into(),
    }
}

fn infer_kind_from_message(message: &str) -> Option<String> {
    let m = message.to_ascii_lowercase();
    if m.contains("tls")
        || m.contains("socket")
        || m.contains("network")
        || m.contains("retriableerror")
    {
        Some("connection".into())
    } else {
        None
    }
}

/// Future event publish points (phase 2+); phase 1 only consumes `turn_failed`.
pub const FUTURE_LIFECYCLE_PUBLISH_POINTS: &[&str] = &[
    "AcpEvent::TurnComplete → turn_completed",
    "terminal::emit_terminal_exit_event → terminal_exited",
    "agent_wakes scheduler → timer_fired",
    "delegation_completed in work_task/engine.rs",
];

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::Arc;

    use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
    use tokio::sync::{mpsc, RwLock};

    use super::*;
    use crate::acp::connection::AgentConnection;
    use crate::acp::session_state::SessionState;
    use crate::acp::types::ConnectionStatus;
    use crate::acp::{EventBusMetrics, InternalEventBus};
    use crate::db::entities::{event_rule, event_rule_log};
    use crate::db::test_helpers::{fresh_in_memory_db, seed_conversation, seed_folder};
    use crate::db::AppDatabase;
    use crate::models::agent::AgentType;
    use crate::web::event_bridge::EventEmitter;

    async fn enable_tls_auto_resume_rule(db: &crate::db::AppDatabase) -> i32 {
        use crate::event_rules::types::{
            ActionKind, AutomationType, ConditionKind, ContainsMatchMode, ConversationRef, EventRuleConfig,
            LifecycleTrigger, RuleAction, RuleCondition, RuleGuard,
        };
        let config = EventRuleConfig {
            automation_type: AutomationType::ContentDetection,
            scope: Default::default(),
            trigger: LifecycleTrigger::TurnFailed,
            condition: RuleCondition {
                kind: ConditionKind::Contains,
                source: Default::default(),
                match_mode: ContainsMatchMode::Any,
                text_contains: vec!["RetriableError".into(), "TLS".into()],
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
                cooldown_ms: 0,
            },
        };
        let now = chrono::Utc::now();
        let row = event_rule::ActiveModel {
            name: Set("e2e tls auto resume".into()),
            enabled: Set(true),
            priority: Set(200),
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

    async fn enable_builtin_template(db: &crate::db::AppDatabase) -> i32 {
        let row = event_rule::Entity::find()
            .filter(event_rule::Column::BuiltinKey.eq("retriable_error_auto_resume"))
            .one(&db.conn)
            .await
            .expect("query")
            .expect("builtin");
        let mut active: event_rule::ActiveModel = row.into();
        active.enabled = Set(true);
        active.update(&db.conn).await.expect("enable").id
    }

    async fn insert_test_rule(
        db: &crate::db::AppDatabase,
        config: crate::event_rules::types::EventRuleConfig,
        name: &str,
    ) -> i32 {
        let now = chrono::Utc::now();
        event_rule::ActiveModel {
            name: Set(name.to_owned()),
            enabled: Set(true),
            priority: Set(500),
            builtin_key: Set(None),
            config: Set(serde_json::to_string(&config).unwrap()),
            created_at: Set(now),
            updated_at: Set(now),
            ..Default::default()
        }
        .insert(&db.conn)
        .await
        .expect("insert test event rule")
        .id
    }

    fn send_action(prompt: &str) -> crate::event_rules::types::RuleAction {
        use crate::event_rules::types::{ActionKind, ConversationRef, RuleAction};
        RuleAction {
            kind: ActionKind::SendToConversation,
            conversation_ref: ConversationRef::SourceConversation,
            conversation_id: None,
            prompt: prompt.to_owned(),
            target_conversation_ids: vec![],
            include_source_context: false,
            include_recent_user_message: false,
            include_final_report: false,
            additional_prompt: None,
            recent_user_message_ignore_rules: vec![],
        }
    }

    fn tls_failure_event(conv_id: i32, folder_id: i32, session_id: &str) -> LifecycleEvent {
        let text: String = "Error: RetriableError: [aborted] Client network socket disconnected before secure TLS connection was established".into();
        LifecycleEvent {
            connection_id: "conn-1".into(),
            conversation_id: conv_id,
            folder_id,
            agent_type: "cursor".into(),
            trigger: LifecycleTrigger::TurnFailed,
            error_kind: Some("connection".into()),
            text: text.clone(),
            assistant_text: None,
            error_text: Some(text.clone()),
            error_severity: None,
            error_title: None,
            error_details: None,
            recent_user_message: None,
            recent_user_messages: Vec::new(),
            turn_session_id: session_id.into(),
            failure_record_id: Some("air-fail-1".into()),
            dedup_key: turn_failure_dedup_key(conv_id, session_id, Some("air-fail-1"), &text),
        }
    }

    fn session_failure_record() -> SessionFailureRecord {
        SessionFailureRecord {
            id: "air-fail-1".into(),
            revision: 1,
            category: "connection".into(),
            severity: "error".into(),
            title: "RetriableError: TLS handshake failed".into(),
            details: Some("Client network socket disconnected".into()),
            actions: vec![],
            resolved: false,
        }
    }

    async fn insert_live_connection(
        mgr: &ConnectionManager,
        conn_id: &str,
        conversation_id: i32,
        folder_id: i32,
    ) -> mpsc::Receiver<crate::acp::connection::ConnectionCommand> {
        let (tx, rx) = mpsc::channel(8);
        let mut state = SessionState::new(
            conn_id.to_string(),
            AgentType::Cursor,
            Some(PathBuf::from("/tmp/e2e-event-rules")),
            "test-window".to_string(),
            None,
        );
        state.status = ConnectionStatus::Connected;
        state.conversation_id = Some(conversation_id);
        state.folder_id = Some(folder_id);
        let conn = AgentConnection {
            id: conn_id.to_string(),
            agent_type: AgentType::Cursor,
            status: ConnectionStatus::Connected,
            owner_window_label: "test-window".to_string(),
            cmd_tx: tx,
            state: Arc::new(RwLock::new(state)),
            emitter: EventEmitter::Noop,
            prompt_lock: Arc::new(tokio::sync::Mutex::new(())),
            config_fingerprint: String::new(),
            last_observed_fingerprint: String::new(),
            child_pid: Arc::new(std::sync::atomic::AtomicU32::new(0)),
        };
        mgr.connections
            .lock()
            .await
            .insert(conn_id.to_string(), conn);
        rx
    }

    fn drain_prompt_texts(
        cmd_rx: &mut mpsc::Receiver<crate::acp::connection::ConnectionCommand>,
    ) -> Vec<String> {
        let mut out = Vec::new();
        while let Ok(cmd) = cmd_rx.try_recv() {
            if let crate::acp::connection::ConnectionCommand::Prompt { blocks, .. } = cmd {
                for block in blocks {
                    if let PromptInputBlock::Text { text } = block {
                        out.push(text);
                    }
                }
            }
        }
        out
    }

    #[tokio::test]
    async fn e2e_retriable_error_rule_matches_tls_message() {
        let db = fresh_in_memory_db().await;
        let rule_id = enable_builtin_template(&db).await;
        let folder_id = seed_folder(&db, "/tmp/e2e-event-rules").await;
        let conv_id = seed_conversation(&db, folder_id, AgentType::Cursor).await;

        let rules = event_rule_service::list_enabled_rules(&db.conn)
            .await
            .expect("rules");
        assert!(rules.iter().any(|r| r.id == rule_id));

        let event = tls_failure_event(conv_id, folder_id, "sess-1");
        let matched = match_rules(&rules, &event);
        assert_eq!(matched.len(), 1);
        assert_eq!(matched[0].config.action.prompt, "继续");

        for i in 0..3 {
            assert_eq!(
                event_rule_service::reserve_attempt(&db.conn, rule_id, conv_id, 3, 0)
                    .await
                    .unwrap(),
                GuardDecision::Allowed,
                "attempt {i}"
            );
        }
        assert_eq!(
            event_rule_service::reserve_attempt(&db.conn, rule_id, conv_id, 3, 0)
                .await
                .unwrap(),
            GuardDecision::MaxAttempts
        );
    }

    #[tokio::test]
    async fn e2e_tls_failure_auto_sends_continue_up_to_three_times() {
        let db = fresh_in_memory_db().await;
        enable_tls_auto_resume_rule(&db).await;
        let folder_id = seed_folder(&db, "/tmp/e2e-event-rules-send").await;
        let conv_id = seed_conversation(&db, folder_id, AgentType::Cursor).await;

        let mgr = ConnectionManager::new();
        let mut cmd_rx = insert_live_connection(&mgr, "conn-1", conv_id, folder_id).await;
        let bus = Arc::new(InternalEventBus::new(Arc::new(EventBusMetrics::default())));
        let log_conn = db.conn.clone();
        let engine = Arc::new(EventRulesEngine::new(db, mgr.clone_ref(), bus));
        engine.reload_rules().await.unwrap();

        let mut prompts = Vec::new();
        for i in 0..3 {
            engine
                .handle_lifecycle_event(tls_failure_event(
                    conv_id,
                    folder_id,
                    &format!("sess-send-{i}"),
                ))
                .await;
            prompts.extend(drain_prompt_texts(&mut cmd_rx));
            if let Some(state) = mgr.get_state("conn-1").await {
                state.write().await.turn_in_flight = false;
            }
        }
        assert_eq!(prompts, vec!["继续", "继续", "继续"]);

        engine
            .handle_lifecycle_event(tls_failure_event(conv_id, folder_id, "sess-send-blocked"))
            .await;
        assert!(drain_prompt_texts(&mut cmd_rx).is_empty());

        let logs = event_rule_log::Entity::find()
            .filter(event_rule_log::Column::Kind.eq("skipped"))
            .filter(event_rule_log::Column::GuardReason.eq("skipped_max_attempts"))
            .all(&log_conn)
            .await
            .expect("logs");
        assert!(
            !logs.is_empty(),
            "max attempts must be recorded in event_rule_log"
        );
    }

    #[tokio::test]
    async fn duplicate_session_failure_and_error_fire_once_on_turn_complete() {
        let db = fresh_in_memory_db().await;
        enable_tls_auto_resume_rule(&db).await;
        let folder_id = seed_folder(&db, "/tmp/dedup").await;
        let conv_id = seed_conversation(&db, folder_id, AgentType::Cursor).await;
        let mgr = ConnectionManager::new();
        let mut cmd_rx = insert_live_connection(&mgr, "conn-dedup", conv_id, folder_id).await;
        let engine = Arc::new(EventRulesEngine::new(
            db,
            mgr,
            Arc::new(InternalEventBus::new(Arc::new(EventBusMetrics::default()))),
        ));
        engine.reload_rules().await.unwrap();

        let conn_id = "conn-dedup";
        engine
            .on_envelope(&EventEnvelope {
                seq: 1,
                connection_id: conn_id.into(),
                payload: AcpEvent::SessionFailure {
                    record: session_failure_record(),
                },
            })
            .await;
        engine
            .on_envelope(&EventEnvelope {
                seq: 2,
                connection_id: conn_id.into(),
                payload: AcpEvent::Error {
                    message: "RetriableError: TLS".into(),
                    agent_type: "cursor".into(),
                    code: Some("turn_failed_unknown".into()),
                    details: None,
                    terminal: false,
                },
            })
            .await;
        engine
            .on_envelope(&EventEnvelope {
                seq: 3,
                connection_id: conn_id.into(),
                payload: AcpEvent::TurnComplete {
                    session_id: "sess-dedup".into(),
                    stop_reason: "unknown".into(),
                    agent_type: "cursor".into(),
                },
            })
            .await;

        assert_eq!(drain_prompt_texts(&mut cmd_rx), vec!["继续"]);
    }

    #[tokio::test]
    async fn pending_turn_failure_merges_session_and_error_details_in_either_order() {
        async fn collect(session_first: bool) -> PendingTurnFailure {
            let db = fresh_in_memory_db().await;
            let folder_id = seed_folder(&db, "/tmp/merge-failure").await;
            let conversation_id =
                seed_conversation(&db, folder_id, AgentType::Cursor).await;
            let manager = ConnectionManager::new();
            let _receiver =
                insert_live_connection(&manager, "conn-merge", conversation_id, folder_id).await;
            let engine = Arc::new(EventRulesEngine::new(
                db,
                manager,
                Arc::new(InternalEventBus::new(Arc::new(EventBusMetrics::default()))),
            ));
            let mut session = session_failure_record();
            session.category = "unknown".into();
            session.title = "SessionFailure title".into();
            session.details = Some("SessionFailure details".into());
            let session_env = EventEnvelope {
                seq: 1,
                connection_id: "conn-merge".into(),
                payload: AcpEvent::SessionFailure { record: session },
            };
            let error_env = EventEnvelope {
                seq: 2,
                connection_id: "conn-merge".into(),
                payload: AcpEvent::Error {
                    message: "Error message".into(),
                    agent_type: "cursor".into(),
                    code: Some("turn_failed_connection".into()),
                    details: Some("Error details".into()),
                    terminal: false,
                },
            };
            if session_first {
                engine.on_envelope(&session_env).await;
                engine.on_envelope(&error_env).await;
            } else {
                engine.on_envelope(&error_env).await;
                engine.on_envelope(&session_env).await;
            }
            let pending = engine
                .pending_failures
                .lock()
                .await
                .remove("conn-merge")
                .expect("merged pending failure");
            pending
        }

        for session_first in [true, false] {
            let pending = collect(session_first).await;
            assert_eq!(pending.error_kind.as_deref(), Some("connection"));
            assert!(pending.text.contains("SessionFailure title"));
            assert!(pending.text.contains("SessionFailure details"));
            assert!(pending.text.contains("Error message"));
            assert!(pending.text.contains("Error details"));
        }
    }

    #[tokio::test]
    async fn max_attempts_reset_after_successful_turn() {
        let db = fresh_in_memory_db().await;
        let rule_id = enable_tls_auto_resume_rule(&db).await;
        let folder_id = seed_folder(&db, "/tmp/reset").await;
        let conv_id = seed_conversation(&db, folder_id, AgentType::Cursor).await;
        let mgr = ConnectionManager::new();
        let _cmd_rx = insert_live_connection(&mgr, "conn-reset", conv_id, folder_id).await;
        let engine = Arc::new(EventRulesEngine::new(
            AppDatabase {
                conn: db.conn.clone(),
            },
            mgr,
            Arc::new(InternalEventBus::new(Arc::new(EventBusMetrics::default()))),
        ));
        engine.reload_rules().await.unwrap();

        for i in 0..3 {
            assert_eq!(
                event_rule_service::reserve_attempt(&db.conn, rule_id, conv_id, 3, 0)
                    .await
                    .unwrap(),
                GuardDecision::Allowed,
                "attempt {i}"
            );
        }
        assert_eq!(
            event_rule_service::reserve_attempt(&db.conn, rule_id, conv_id, 3, 0)
                .await
                .unwrap(),
            GuardDecision::MaxAttempts
        );

        engine
            .on_envelope(&EventEnvelope {
                seq: 1,
                connection_id: "conn-reset".into(),
                payload: AcpEvent::TurnComplete {
                    session_id: "sess-ok".into(),
                    stop_reason: "end_turn".into(),
                    agent_type: "cursor".into(),
                },
            })
            .await;

        assert_eq!(
            event_rule_service::reserve_attempt(&db.conn, rule_id, conv_id, 3, 0)
                .await
                .unwrap(),
            GuardDecision::Allowed,
            "successful turn must reset the attempt chain"
        );
    }

    #[tokio::test]
    async fn turn_complete_failure_sends_only_when_turn_not_in_flight() {
        let db = fresh_in_memory_db().await;
        enable_tls_auto_resume_rule(&db).await;
        let folder_id = seed_folder(&db, "/tmp/settle").await;
        let conv_id = seed_conversation(&db, folder_id, AgentType::Cursor).await;
        let mgr = ConnectionManager::new();
        let mut cmd_rx = insert_live_connection(&mgr, "conn-settle", conv_id, folder_id).await;
        if let Some(state) = mgr.get_state("conn-settle").await {
            state.write().await.turn_in_flight = true;
        }
        let engine = Arc::new(EventRulesEngine::new(
            db,
            mgr.clone_ref(),
            Arc::new(InternalEventBus::new(Arc::new(EventBusMetrics::default()))),
        ));
        engine.reload_rules().await.unwrap();

        engine
            .on_envelope(&EventEnvelope {
                seq: 1,
                connection_id: "conn-settle".into(),
                payload: AcpEvent::SessionFailure {
                    record: session_failure_record(),
                },
            })
            .await;
        engine
            .on_envelope(&EventEnvelope {
                seq: 2,
                connection_id: "conn-settle".into(),
                payload: AcpEvent::TurnComplete {
                    session_id: "sess-settle".into(),
                    stop_reason: "unknown".into(),
                    agent_type: "cursor".into(),
                },
            })
            .await;
        assert!(
            drain_prompt_texts(&mut cmd_rx).is_empty(),
            "must not send while turn_in_flight is still true"
        );

        if let Some(state) = mgr.get_state("conn-settle").await {
            state.write().await.turn_in_flight = false;
        }
        let mut settled_event = tls_failure_event(conv_id, folder_id, "sess-settle-2");
        settled_event.connection_id = "conn-settle".into();
        engine.handle_lifecycle_event(settled_event).await;
        assert_eq!(drain_prompt_texts(&mut cmd_rx), vec!["继续"]);
    }

    #[tokio::test]
    async fn cancelled_turn_does_not_send() {
        let db = fresh_in_memory_db().await;
        enable_tls_auto_resume_rule(&db).await;
        let folder_id = seed_folder(&db, "/tmp/cancelled").await;
        let conv_id = seed_conversation(&db, folder_id, AgentType::Cursor).await;
        let mgr = ConnectionManager::new();
        let mut cmd_rx = insert_live_connection(&mgr, "conn-cancel", conv_id, folder_id).await;
        let engine = Arc::new(EventRulesEngine::new(
            db,
            mgr,
            Arc::new(InternalEventBus::new(Arc::new(EventBusMetrics::default()))),
        ));
        engine.reload_rules().await.unwrap();

        engine
            .on_envelope(&EventEnvelope {
                seq: 1,
                connection_id: "conn-cancel".into(),
                payload: AcpEvent::TurnComplete {
                    session_id: "session-cancel".into(),
                    stop_reason: "cancelled".into(),
                    agent_type: "cursor".into(),
                },
            })
            .await;

        assert!(drain_prompt_texts(&mut cmd_rx).is_empty());
    }

    #[tokio::test]
    async fn disconnected_target_does_not_send() {
        let db = fresh_in_memory_db().await;
        enable_tls_auto_resume_rule(&db).await;
        let folder_id = seed_folder(&db, "/tmp/disconnected").await;
        let conv_id = seed_conversation(&db, folder_id, AgentType::Cursor).await;
        let mgr = ConnectionManager::new();
        let mut cmd_rx = insert_live_connection(&mgr, "conn-offline", conv_id, folder_id).await;
        if let Some(state) = mgr.get_state("conn-offline").await {
            state.write().await.status = ConnectionStatus::Disconnected;
        }
        let engine = Arc::new(EventRulesEngine::new(
            db,
            mgr,
            Arc::new(InternalEventBus::new(Arc::new(EventBusMetrics::default()))),
        ));
        engine.reload_rules().await.unwrap();

        engine
            .handle_lifecycle_event(tls_failure_event(conv_id, folder_id, "session-offline"))
            .await;

        assert!(drain_prompt_texts(&mut cmd_rx).is_empty());
    }

    #[tokio::test]
    async fn specific_target_chooses_idle_identity_matching_connection() {
        use crate::event_rules::types::{
            ActionKind, AutomationType, ConditionKind, ContainsMatchMode, ConversationRef, EventRuleConfig,
            LifecycleTrigger, RuleAction, RuleCondition, RuleGuard,
        };

        let db = fresh_in_memory_db().await;
        let folder_id = seed_folder(&db, "/tmp/specific-target").await;
        let source_id = seed_conversation(&db, folder_id, AgentType::Cursor).await;
        let target_id = seed_conversation(&db, folder_id, AgentType::Cursor).await;
        let now = chrono::Utc::now();
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
                conversation_ref: ConversationRef::SpecificConversation,
                conversation_id: Some(target_id),
                prompt: "specific".into(),
                target_conversation_ids: vec![],
                include_source_context: false,
                include_recent_user_message: false,
                include_final_report: false,
                additional_prompt: None,
                recent_user_message_ignore_rules: vec![],
            },
            guard: RuleGuard {
                max_attempts: 3,
                cooldown_ms: 0,
            },
        };
        event_rule::ActiveModel {
            name: Set("specific target".into()),
            enabled: Set(true),
            priority: Set(100),
            builtin_key: Set(None),
            config: Set(serde_json::to_string(&config).unwrap()),
            created_at: Set(now),
            updated_at: Set(now),
            ..Default::default()
        }
        .insert(&db.conn)
        .await
        .expect("insert specific target rule");

        let manager = ConnectionManager::new();
        let mut busy =
            insert_live_connection(&manager, "target-busy", target_id, folder_id).await;
        let mut idle =
            insert_live_connection(&manager, "target-idle", target_id, folder_id).await;
        manager
            .get_state("target-busy")
            .await
            .expect("busy connection")
            .write()
            .await
            .turn_in_flight = true;
        let engine = EventRulesEngine::new(
            db,
            manager,
            Arc::new(InternalEventBus::new(Arc::new(EventBusMetrics::default()))),
        );
        engine.reload_rules().await.unwrap();

        engine
            .handle_lifecycle_event(tls_failure_event(source_id, folder_id, "specific-turn"))
            .await;

        assert!(drain_prompt_texts(&mut busy).is_empty());
        assert_eq!(drain_prompt_texts(&mut idle), vec!["specific"]);
    }

    #[tokio::test]
    async fn identical_failures_in_distinct_turns_both_send() {
        let db = fresh_in_memory_db().await;
        enable_tls_auto_resume_rule(&db).await;
        let folder_id = seed_folder(&db, "/tmp/distinct-turns").await;
        let conv_id = seed_conversation(&db, folder_id, AgentType::Cursor).await;
        let mgr = ConnectionManager::new();
        let mut cmd_rx = insert_live_connection(&mgr, "conn-turns", conv_id, folder_id).await;
        let engine = Arc::new(EventRulesEngine::new(
            db,
            mgr.clone_ref(),
            Arc::new(InternalEventBus::new(Arc::new(EventBusMetrics::default()))),
        ));
        engine.reload_rules().await.unwrap();

        for turn_marker in 0..2 {
            if let Some(state) = mgr.get_state("conn-turns").await {
                let mut state = state.write().await;
                state.turns_completed = turn_marker;
                state.turn_in_flight = false;
                state.status = ConnectionStatus::Connected;
            }
            engine
                .on_envelope(&EventEnvelope {
                    seq: turn_marker * 2 + 1,
                    connection_id: "conn-turns".into(),
                    payload: AcpEvent::SessionFailure {
                        record: session_failure_record(),
                    },
                })
                .await;
            engine
                .on_envelope(&EventEnvelope {
                    seq: turn_marker * 2 + 2,
                    connection_id: "conn-turns".into(),
                    payload: AcpEvent::TurnComplete {
                        session_id: "same-session".into(),
                        stop_reason: "unknown".into(),
                        agent_type: "cursor".into(),
                    },
                })
                .await;
        }

        assert_eq!(drain_prompt_texts(&mut cmd_rx), vec!["继续", "继续"]);
    }

    #[tokio::test]
    async fn streaming_content_match_waits_for_turn_settle() {
        use crate::event_rules::types::{
            AutomationType, ConditionKind, ContainsMatchMode, EventRuleConfig, LifecycleTrigger,
            RuleCondition, RuleGuard,
        };
        let db = fresh_in_memory_db().await;
        let folder_id = seed_folder(&db, "/tmp/streaming-match").await;
        let conversation_id = seed_conversation(&db, folder_id, AgentType::Cursor).await;
        insert_test_rule(
            &db,
            EventRuleConfig {
                automation_type: AutomationType::ContentDetection,
                scope: Default::default(),
                trigger: LifecycleTrigger::ContentMatched,
                condition: RuleCondition {
                    kind: ConditionKind::Contains,
                    source: crate::event_rules::types::ContentSource::AiOutput,
                    match_mode: ContainsMatchMode::Any,
                    text_contains: vec!["needle".into()],
                    regex: None,
                    error_kind: None,
                    error_severity: None,
                    error_title: None,
                    error_details: None,
                },
                action: send_action("follow up"),
                guard: RuleGuard {
                    max_attempts: 3,
                    cooldown_ms: 0,
                },
            },
            "streaming content",
        )
        .await;
        let manager = ConnectionManager::new();
        let mut cmd_rx =
            insert_live_connection(&manager, "conn-stream", conversation_id, folder_id).await;
        let engine = Arc::new(EventRulesEngine::new(
            db,
            manager,
            Arc::new(InternalEventBus::new(Arc::new(EventBusMetrics::default()))),
        ));
        engine.reload_rules().await.unwrap();
        engine
            .on_envelope(&EventEnvelope {
                seq: 1,
                connection_id: "conn-stream".into(),
                payload: AcpEvent::ContentDelta {
                    text: "needle appears while streaming".into(),
                    parent_tool_use_id: None,
                },
            })
            .await;
        assert!(drain_prompt_texts(&mut cmd_rx).is_empty());
        engine
            .on_envelope(&EventEnvelope {
                seq: 2,
                connection_id: "conn-stream".into(),
                payload: AcpEvent::TurnComplete {
                    session_id: "stream-session".into(),
                    stop_reason: "end_turn".into(),
                    agent_type: "cursor".into(),
                },
            })
            .await;
        assert_eq!(drain_prompt_texts(&mut cmd_rx), vec!["follow up"]);
    }

    #[tokio::test]
    async fn completion_forwarding_uses_only_end_turn_and_current_report() {
        use crate::event_rules::types::{
            AutomationType, ConditionKind, ContainsMatchMode, EventRuleConfig, LifecycleTrigger,
            RuleCondition, RuleGuard,
        };
        let db = fresh_in_memory_db().await;
        let folder_id = seed_folder(&db, "/tmp/completion-forward").await;
        let conversation_id = seed_conversation(&db, folder_id, AgentType::Cursor).await;
        let mut action = send_action("audit");
        action.include_final_report = true;
        insert_test_rule(
            &db,
            EventRuleConfig {
                automation_type: AutomationType::ForwardAfterTaskCompletion,
                scope: Default::default(),
                trigger: LifecycleTrigger::TurnCompleted,
                condition: RuleCondition {
                    kind: ConditionKind::None,
                    source: Default::default(),
                    match_mode: ContainsMatchMode::Any,
                    text_contains: vec![],
                    regex: None,
                    error_kind: None,
                    error_severity: None,
                    error_title: None,
                    error_details: None,
                },
                action,
                guard: RuleGuard {
                    max_attempts: 3,
                    cooldown_ms: 0,
                },
            },
            "completion forwarding",
        )
        .await;
        let manager = ConnectionManager::new();
        let mut cmd_rx =
            insert_live_connection(&manager, "conn-complete", conversation_id, folder_id).await;
        let engine = Arc::new(EventRulesEngine::new(
            db,
            manager,
            Arc::new(InternalEventBus::new(Arc::new(EventBusMetrics::default()))),
        ));
        engine.reload_rules().await.unwrap();
        engine
            .on_envelope(&EventEnvelope {
                seq: 1,
                connection_id: "conn-complete".into(),
                payload: AcpEvent::ContentDelta {
                    text: "current turn report".into(),
                    parent_tool_use_id: None,
                },
            })
            .await;
        engine
            .on_envelope(&EventEnvelope {
                seq: 2,
                connection_id: "conn-complete".into(),
                payload: AcpEvent::TurnComplete {
                    session_id: "complete-session".into(),
                    stop_reason: "end_turn".into(),
                    agent_type: "cursor".into(),
                },
            })
            .await;
        let prompts = drain_prompt_texts(&mut cmd_rx);
        assert_eq!(prompts.len(), 1);
        assert!(prompts[0].contains("current turn report"));

        let db = fresh_in_memory_db().await;
        let folder_id = seed_folder(&db, "/tmp/completion-failure").await;
        let conversation_id = seed_conversation(&db, folder_id, AgentType::Cursor).await;
        let mut action = send_action("audit");
        action.include_final_report = true;
        insert_test_rule(
            &db,
            EventRuleConfig {
                automation_type: AutomationType::ForwardAfterTaskCompletion,
                scope: Default::default(),
                trigger: LifecycleTrigger::TurnCompleted,
                condition: RuleCondition {
                    kind: ConditionKind::None,
                    source: Default::default(),
                    match_mode: ContainsMatchMode::Any,
                    text_contains: vec![],
                    regex: None,
                    error_kind: None,
                    error_severity: None,
                    error_title: None,
                    error_details: None,
                },
                action,
                guard: RuleGuard {
                    max_attempts: 3,
                    cooldown_ms: 0,
                },
            },
            "completion failure excluded",
        )
        .await;
        let manager = ConnectionManager::new();
        let mut cmd_rx =
            insert_live_connection(&manager, "conn-failure", conversation_id, folder_id).await;
        let engine = Arc::new(EventRulesEngine::new(
            db,
            manager,
            Arc::new(InternalEventBus::new(Arc::new(EventBusMetrics::default()))),
        ));
        engine.reload_rules().await.unwrap();
        engine
            .on_envelope(&EventEnvelope {
                seq: 1,
                connection_id: "conn-failure".into(),
                payload: AcpEvent::TurnComplete {
                    session_id: "failure-session".into(),
                    stop_reason: "unknown".into(),
                    agent_type: "cursor".into(),
                },
            })
            .await;
        assert!(drain_prompt_texts(&mut cmd_rx).is_empty());
    }

    #[tokio::test]
    async fn recent_user_message_uses_last_non_ignored_candidate() {
        use crate::event_rules::types::{
            AutomationType, ConditionKind, ContainsMatchMode, EventRuleConfig, LifecycleTrigger,
            RuleCondition, RuleGuard, UserMessageIgnoreRule,
        };
        let db = fresh_in_memory_db().await;
        let folder_id = seed_folder(&db, "/tmp/recent-user").await;
        let conversation_id = seed_conversation(&db, folder_id, AgentType::Cursor).await;
        let mut action = send_action("audit");
        action.include_recent_user_message = true;
        action.recent_user_message_ignore_rules = vec![UserMessageIgnoreRule {
            kind: "exact".into(),
            value: "继续".into(),
        }];
        insert_test_rule(
            &db,
            EventRuleConfig {
                automation_type: AutomationType::ForwardAfterTaskCompletion,
                scope: Default::default(),
                trigger: LifecycleTrigger::TurnCompleted,
                condition: RuleCondition {
                    kind: ConditionKind::None,
                    source: Default::default(),
                    match_mode: ContainsMatchMode::Any,
                    text_contains: vec![],
                    regex: None,
                    error_kind: None,
                    error_severity: None,
                    error_title: None,
                    error_details: None,
                },
                action,
                guard: RuleGuard {
                    max_attempts: 3,
                    cooldown_ms: 0,
                },
            },
            "recent valid user",
        )
        .await;
        let manager = ConnectionManager::new();
        let mut cmd_rx =
            insert_live_connection(&manager, "conn-user", conversation_id, folder_id).await;
        let engine = Arc::new(EventRulesEngine::new(
            db,
            manager,
            Arc::new(InternalEventBus::new(Arc::new(EventBusMetrics::default()))),
        ));
        engine.reload_rules().await.unwrap();
        for (seq, message) in [(1, "继续"), (2, "继续"), (3, "真实任务")] {
            engine
                .on_envelope(&EventEnvelope {
                    seq,
                    connection_id: "conn-user".into(),
                    payload: AcpEvent::UserMessage {
                        message_id: format!("m{seq}"),
                        blocks: vec![crate::acp::types::UserMessageBlock::Text {
                            text: message.into(),
                        }],
                    },
                })
                .await;
        }
        engine
            .on_envelope(&EventEnvelope {
                seq: 4,
                connection_id: "conn-user".into(),
                payload: AcpEvent::TurnComplete {
                    session_id: "user-session".into(),
                    stop_reason: "end_turn".into(),
                    agent_type: "cursor".into(),
                },
            })
            .await;
        let prompts = drain_prompt_texts(&mut cmd_rx);
        assert_eq!(prompts.len(), 1);
        assert!(prompts[0].contains("真实任务"));
        assert!(!prompts[0].contains("Recent valid user message:\n继续"));
    }

    #[test]
    fn cancelled_turn_never_becomes_automatic_failure() {
        assert!(!is_automatic_failure_stop_reason("cancelled"));
        assert!(is_automatic_failure_stop_reason("unknown"));
    }

    #[test]
    fn documents_future_publish_points() {
        assert!(!FUTURE_LIFECYCLE_PUBLISH_POINTS.is_empty());
    }
}
