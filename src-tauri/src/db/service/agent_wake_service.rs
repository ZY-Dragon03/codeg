use chrono::{DateTime, Utc};
use sea_orm::sea_query::Expr;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder,
    QuerySelect, Set, TransactionTrait,
};

use crate::db::entities::agent_wake;
use crate::db::error::DbError;

pub const STATUS_PENDING: &str = "pending";
pub const STATUS_DISPATCHING: &str = "dispatching";
pub const STATUS_SENT: &str = "sent";
pub const STATUS_FAILED: &str = "failed";
pub const STATUS_CANCELLED: &str = "cancelled";
pub const TRIGGER_AFTER: &str = "timer_after";
pub const TRIGGER_AT: &str = "timer_at";
pub const TRIGGER_PROCESS_EXIT: &str = "process_exit";

pub const ERR_WAKE_DISPATCHING: &str = "wake_dispatching";
pub const ERR_WAKE_AT_PAST_REQUIRES_EDIT: &str = "wake_at_past_requires_edit";
pub const ERR_WAKE_PROCESS_STALE_REQUIRES_EDIT: &str = "wake_process_stale_requires_edit";
pub const TARGET_MODE_CURRENT: &str = "current";
pub const TARGET_MODE_ALL_CURRENT: &str = "all_current";
pub const TARGET_MODE_SPECIFIC_MULTIPLE: &str = "specific_multiple";

#[derive(Debug, Clone)]
pub struct CreateWake {
    pub source_conversation_id: i32,
    pub source_connection_id: Option<String>,
    pub terminal_id: Option<String>,
    pub process_ref: Option<String>,
    pub trigger_kind: String,
    pub fire_at: Option<DateTime<Utc>>,
    pub delay_ms: Option<i64>,
    pub target_mode: String,
    pub target_conversation_ids: Vec<i32>,
    pub prompt: String,
    pub display_name: Option<String>,
    pub creator_kind: String,
    pub creator_id: Option<String>,
}

pub async fn create(
    db: &DatabaseConnection,
    input: CreateWake,
) -> Result<agent_wake::Model, DbError> {
    if input.source_conversation_id <= 0 {
        return Err(DbError::Validation(
            "source conversation is required".into(),
        ));
    }
    if input.prompt.trim().is_empty() {
        return Err(DbError::Validation("wake prompt must not be empty".into()));
    }
    if input.trigger_kind == TRIGGER_PROCESS_EXIT && input.terminal_id.is_none() {
        return Err(DbError::Validation(
            "process exit wake requires terminal_id".into(),
        ));
    }
    let (target_mode, target_ids) =
        normalize_target_config(db, &input.target_mode, &input.target_conversation_ids).await?;
    let now = Utc::now();
    let delay_ms = resolve_delay_ms(&input.trigger_kind, input.fire_at, input.delay_ms, now);
    let model = agent_wake::ActiveModel {
        source_conversation_id: Set(input.source_conversation_id),
        creator_kind: Set(normalize_creator_kind(&input.creator_kind)?),
        creator_id: Set(input.creator_id),
        source_connection_id: Set(input.source_connection_id),
        terminal_id: Set(input.terminal_id),
        process_ref: Set(input.process_ref),
        trigger_kind: Set(input.trigger_kind),
        fire_at: Set(input.fire_at),
        delay_ms: Set(delay_ms),
        target_mode: Set(target_mode),
        target_conversation_ids: Set(if target_ids.is_empty() {
            None
        } else {
            Some(serde_json::to_string(&target_ids).map_err(|error| {
                DbError::Validation(format!("failed to encode wake targets: {error}"))
            })?)
        }),
        prompt: Set(input.prompt.trim().to_owned()),
        display_name: Set(normalize_display_name(input.display_name)),
        status: Set(STATUS_PENDING.to_owned()),
        claimed_at: Set(None),
        consumed_at: Set(None),
        error: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(db)
    .await?;
    Ok(model)
}

fn resolve_delay_ms(
    trigger_kind: &str,
    fire_at: Option<DateTime<Utc>>,
    delay_ms: Option<i64>,
    now: DateTime<Utc>,
) -> Option<i64> {
    if trigger_kind != TRIGGER_AFTER {
        return None;
    }
    if let Some(delay_ms) = delay_ms.filter(|value| *value > 0) {
        return Some(delay_ms);
    }
    fire_at.map(|at| (at - now).num_milliseconds().max(1))
}

fn normalize_display_name(value: Option<String>) -> Option<String> {
    value
        .map(|name| name.trim().to_owned())
        .filter(|name| !name.is_empty())
}

fn normalize_creator_kind(value: &str) -> Result<String, DbError> {
    let value = value.trim().to_ascii_lowercase();
    match value.as_str() {
        "user" | "agent" => Ok(value),
        _ => Err(DbError::Validation("creator_kind must be user or agent".into())),
    }
}

fn normalize_target_mode(value: &str) -> Result<String, DbError> {
    let value = value.trim().to_ascii_lowercase();
    match value.as_str() {
        TARGET_MODE_CURRENT | TARGET_MODE_ALL_CURRENT | TARGET_MODE_SPECIFIC_MULTIPLE => {
            Ok(value)
        }
        _ => Err(DbError::Validation(
            "target_mode must be current, all_current, or specific_multiple".into(),
        )),
    }
}

fn normalize_target_ids(values: &[i32]) -> Result<Vec<i32>, DbError> {
    let mut ids = Vec::with_capacity(values.len());
    for id in values {
        if *id <= 0 {
            return Err(DbError::Validation(
                "target conversation ids must be positive".into(),
            ));
        }
        if !ids.contains(id) {
            ids.push(*id);
        }
    }
    Ok(ids)
}

async fn normalize_target_config(
    db: &DatabaseConnection,
    mode: &str,
    values: &[i32],
) -> Result<(String, Vec<i32>), DbError> {
    let mode = normalize_target_mode(mode)?;
    let ids = normalize_target_ids(values)?;
    if mode != TARGET_MODE_CURRENT && ids.is_empty() {
        return Err(DbError::Validation(
            "non-current target mode requires at least one conversation".into(),
        ));
    }
    for id in &ids {
        let exists = crate::db::entities::conversation::Entity::find_by_id(*id)
            .filter(crate::db::entities::conversation::Column::DeletedAt.is_null())
            .one(db)
            .await?
            .is_some();
        if !exists {
            return Err(DbError::Validation(format!(
                "target conversation {id} does not exist or is deleted"
            )));
        }
    }
    Ok((mode, ids))
}

pub fn target_ids(row: &agent_wake::Model) -> Result<Vec<i32>, DbError> {
    if row.target_mode == TARGET_MODE_CURRENT {
        return Ok(vec![row.source_conversation_id]);
    }
    let ids = row
        .target_conversation_ids
        .as_deref()
        .map(serde_json::from_str::<Vec<i32>>)
        .transpose()
        .map_err(|error| DbError::Validation(format!("invalid wake target list: {error}")))?
        .unwrap_or_default();
    Ok(ids)
}

pub async fn list_for_source(
    db: &DatabaseConnection,
    source_conversation_id: i32,
) -> Result<Vec<agent_wake::Model>, DbError> {
    Ok(agent_wake::Entity::find()
        .filter(agent_wake::Column::SourceConversationId.eq(source_conversation_id))
        .order_by_desc(agent_wake::Column::CreatedAt)
        .all(db)
        .await?)
}

pub async fn cancel(
    db: &DatabaseConnection,
    source_conversation_id: i32,
    id: i32,
) -> Result<agent_wake::Model, DbError> {
    let row = find_scoped(db, source_conversation_id, id).await?;
    if row.status == STATUS_DISPATCHING {
        return Err(DbError::Validation(ERR_WAKE_DISPATCHING.into()));
    }
    if !matches!(row.status.as_str(), STATUS_PENDING) {
        return Err(DbError::Validation(
            "only pending wakes can be cancelled".into(),
        ));
    }
    let mut active: agent_wake::ActiveModel = row.into();
    active.status = Set(STATUS_CANCELLED.to_owned());
    active.error = Set(Some("cancelled".into()));
    active.updated_at = Set(Utc::now());
    Ok(active.update(db).await?)
}

pub async fn delete(
    db: &DatabaseConnection,
    source_conversation_id: i32,
    id: i32,
) -> Result<(), DbError> {
    let row = find_scoped(db, source_conversation_id, id).await?;
    if row.status == STATUS_DISPATCHING {
        return Err(DbError::Validation(ERR_WAKE_DISPATCHING.into()));
    }
    agent_wake::Entity::delete_by_id(id).exec(db).await?;
    Ok(())
}

pub async fn rearm(
    db: &DatabaseConnection,
    source_conversation_id: i32,
    id: i32,
    live_terminal_ids: &[String],
) -> Result<agent_wake::Model, DbError> {
    let row = find_scoped(db, source_conversation_id, id).await?;
    if row.status == STATUS_DISPATCHING {
        return Err(DbError::Validation(ERR_WAKE_DISPATCHING.into()));
    }
    if !matches!(
        row.status.as_str(),
        STATUS_SENT | STATUS_FAILED | STATUS_CANCELLED
    ) {
        return Err(DbError::Validation(
            "only inactive wakes can be rearmed".into(),
        ));
    }

    let now = Utc::now();
    let mut active: agent_wake::ActiveModel = row.clone().into();
    match row.trigger_kind.as_str() {
        TRIGGER_AFTER => {
            let delay_ms = persisted_delay_ms(&row)?;
            active.delay_ms = Set(Some(delay_ms));
            active.fire_at = Set(Some(now + chrono::Duration::milliseconds(delay_ms)));
        }
        TRIGGER_AT => {
            let fire_at = row.fire_at.unwrap_or(now);
            if fire_at <= now {
                return Err(DbError::Validation(ERR_WAKE_AT_PAST_REQUIRES_EDIT.into()));
            }
            active.fire_at = Set(Some(fire_at));
        }
        TRIGGER_PROCESS_EXIT => {
            let terminal_id = row
                .terminal_id
                .as_deref()
                .or(row.process_ref.as_deref())
                .filter(|value| !value.is_empty())
                .ok_or_else(|| {
                    DbError::Validation(ERR_WAKE_PROCESS_STALE_REQUIRES_EDIT.into())
                })?;
            if !live_terminal_ids.iter().any(|id| id == terminal_id) {
                return Err(DbError::Validation(ERR_WAKE_PROCESS_STALE_REQUIRES_EDIT.into()));
            }
            active.fire_at = Set(None);
        }
        _ => {
            return Err(DbError::Validation("unsupported wake trigger".into()));
        }
    }
    active.status = Set(STATUS_PENDING.to_owned());
    active.claimed_at = Set(None);
    active.consumed_at = Set(None);
    active.error = Set(None);
    active.updated_at = Set(now);
    Ok(active.update(db).await?)
}

pub async fn update(
    db: &DatabaseConnection,
    source_conversation_id: i32,
    id: i32,
    input: CreateWake,
) -> Result<agent_wake::Model, DbError> {
    if input.source_conversation_id != source_conversation_id {
        return Err(DbError::Validation(
            "wake source conversation does not match update owner".into(),
        ));
    }
    if input.prompt.trim().is_empty() {
        return Err(DbError::Validation("wake prompt must not be empty".into()));
    }
    if input.trigger_kind == TRIGGER_PROCESS_EXIT && input.terminal_id.is_none() {
        return Err(DbError::Validation(
            "process exit wake requires terminal_id".into(),
        ));
    }
    let (target_mode, target_ids) =
        normalize_target_config(db, &input.target_mode, &input.target_conversation_ids).await?;
    if input.trigger_kind == TRIGGER_AT {
        let fire_at = input
            .fire_at
            .ok_or_else(|| DbError::Validation("scheduled wake requires fire_at".into()))?;
        if fire_at <= Utc::now() {
            return Err(DbError::Validation(ERR_WAKE_AT_PAST_REQUIRES_EDIT.into()));
        }
    }
    let row = find_scoped(db, source_conversation_id, id).await?;
    if row.status == STATUS_DISPATCHING {
        return Err(DbError::Validation(ERR_WAKE_DISPATCHING.into()));
    }
    let now = Utc::now();
    let delay_ms = resolve_delay_ms(&input.trigger_kind, input.fire_at, input.delay_ms, now);
    let mut active: agent_wake::ActiveModel = row.into();
    active.source_connection_id = Set(input.source_connection_id);
    active.terminal_id = Set(input.terminal_id);
    active.process_ref = Set(input.process_ref);
    active.trigger_kind = Set(input.trigger_kind);
    active.fire_at = Set(input.fire_at);
    active.delay_ms = Set(delay_ms);
    active.target_mode = Set(target_mode);
    active.target_conversation_ids = Set(if target_ids.is_empty() {
        None
    } else {
        Some(serde_json::to_string(&target_ids).map_err(|error| {
            DbError::Validation(format!("failed to encode wake targets: {error}"))
        })?)
    });
    active.prompt = Set(input.prompt.trim().to_owned());
    active.display_name = Set(normalize_display_name(input.display_name));
    active.status = Set(STATUS_PENDING.to_owned());
    active.claimed_at = Set(None);
    active.consumed_at = Set(None);
    active.error = Set(None);
    active.updated_at = Set(now);
    Ok(active.update(db).await?)
}

async fn find_scoped(
    db: &DatabaseConnection,
    source_conversation_id: i32,
    id: i32,
) -> Result<agent_wake::Model, DbError> {
    agent_wake::Entity::find_by_id(id)
        .filter(agent_wake::Column::SourceConversationId.eq(source_conversation_id))
        .one(db)
        .await?
        .ok_or_else(|| DbError::NotFound(format!("agent_wake {id}")))
}

fn persisted_delay_ms(row: &agent_wake::Model) -> Result<i64, DbError> {
    if let Some(delay_ms) = row.delay_ms.filter(|value| *value > 0) {
        return Ok(delay_ms);
    }
    if let Some(fire_at) = row.fire_at {
        return Ok((fire_at - row.created_at).num_milliseconds().max(1));
    }
    Err(DbError::Validation(
        "timer_after wake is missing a persisted delay".into(),
    ))
}

/// Atomically claim due timer rows.
pub async fn claim_due(
    db: &DatabaseConnection,
    now: DateTime<Utc>,
    limit: u64,
) -> Result<Vec<agent_wake::Model>, DbError> {
    let txn = db.begin().await?;
    let rows = agent_wake::Entity::find()
        .filter(agent_wake::Column::Status.eq(STATUS_PENDING))
        .filter(agent_wake::Column::TriggerKind.is_in([TRIGGER_AFTER, TRIGGER_AT]))
        .filter(agent_wake::Column::FireAt.is_not_null())
        .filter(agent_wake::Column::FireAt.lte(now))
        .order_by_asc(agent_wake::Column::FireAt)
        .limit(limit)
        .all(&txn)
        .await?;
    let mut claimed = Vec::with_capacity(rows.len());
    for row in rows {
        let result = agent_wake::Entity::update_many()
            .col_expr(agent_wake::Column::Status, Expr::value(STATUS_DISPATCHING))
            .col_expr(agent_wake::Column::ClaimedAt, Expr::value(Some(now)))
            .col_expr(agent_wake::Column::UpdatedAt, Expr::value(now))
            .filter(agent_wake::Column::Id.eq(row.id))
            .filter(agent_wake::Column::Status.eq(STATUS_PENDING))
            .exec(&txn)
            .await?;
        if result.rows_affected == 1 {
            if let Some(claimed_row) = agent_wake::Entity::find_by_id(row.id).one(&txn).await? {
                claimed.push(claimed_row);
            }
        }
    }
    txn.commit().await?;
    Ok(claimed)
}

pub async fn claim_process_exit(
    db: &DatabaseConnection,
    terminal_id: &str,
) -> Result<Vec<agent_wake::Model>, DbError> {
    claim_process_exit_for_source(db, terminal_id, None, None).await
}

pub async fn claim_process_exit_for_source(
    db: &DatabaseConnection,
    terminal_id: &str,
    source_conversation_id: Option<i32>,
    source_connection_id: Option<&str>,
) -> Result<Vec<agent_wake::Model>, DbError> {
    let txn = db.begin().await?;
    let mut query = agent_wake::Entity::find()
        .filter(agent_wake::Column::Status.eq(STATUS_PENDING))
        .filter(agent_wake::Column::TriggerKind.eq(TRIGGER_PROCESS_EXIT))
        .filter(agent_wake::Column::TerminalId.eq(terminal_id));
    if let Some(source_conversation_id) = source_conversation_id {
        query = query.filter(
            agent_wake::Column::SourceConversationId.eq(source_conversation_id),
        );
    }
    if let Some(source_connection_id) = source_connection_id {
        query = query.filter(
            agent_wake::Column::SourceConnectionId.eq(source_connection_id),
        );
    }
    let rows = query.all(&txn).await?;
    let now = Utc::now();
    let mut claimed = Vec::with_capacity(rows.len());
    for row in rows {
        let result = agent_wake::Entity::update_many()
            .col_expr(agent_wake::Column::Status, Expr::value(STATUS_DISPATCHING))
            .col_expr(agent_wake::Column::ClaimedAt, Expr::value(Some(now)))
            .col_expr(agent_wake::Column::UpdatedAt, Expr::value(now))
            .filter(agent_wake::Column::Id.eq(row.id))
            .filter(agent_wake::Column::Status.eq(STATUS_PENDING))
            .exec(&txn)
            .await?;
        if result.rows_affected == 1 {
            if let Some(claimed_row) = agent_wake::Entity::find_by_id(row.id).one(&txn).await? {
                claimed.push(claimed_row);
            }
        }
    }
    txn.commit().await?;
    Ok(claimed)
}

pub async fn mark_sent(db: &DatabaseConnection, id: i32) -> Result<(), DbError> {
    if let Some(row) = agent_wake::Entity::find_by_id(id).one(db).await? {
        let mut active: agent_wake::ActiveModel = row.into();
        let now = Utc::now();
        active.status = Set(STATUS_SENT.to_owned());
        active.consumed_at = Set(Some(now));
        active.updated_at = Set(now);
        active.update(db).await?;
    }
    Ok(())
}

pub async fn mark_failed(db: &DatabaseConnection, id: i32, error: String) -> Result<(), DbError> {
    if let Some(row) = agent_wake::Entity::find_by_id(id).one(db).await? {
        let mut active: agent_wake::ActiveModel = row.into();
        active.status = Set(STATUS_FAILED.to_owned());
        active.error = Set(Some(error));
        active.consumed_at = Set(Some(Utc::now()));
        active.updated_at = Set(Utc::now());
        active.update(db).await?;
    }
    Ok(())
}

/// Return rows left in `dispatching` by a process crash to the pending queue.
/// A short lease prevents a duplicate send while an older scheduler is still
/// finishing, while guaranteeing restart recovery after the lease expires.
pub async fn recover_stale_dispatching(
    db: &DatabaseConnection,
    now: DateTime<Utc>,
    lease: chrono::Duration,
) -> Result<u64, DbError> {
    let cutoff = now - lease;
    let rows = agent_wake::Entity::find()
        .filter(agent_wake::Column::Status.eq(STATUS_DISPATCHING))
        .filter(
            sea_orm::Condition::any()
                .add(agent_wake::Column::ClaimedAt.is_null())
                .add(agent_wake::Column::ClaimedAt.lt(cutoff)),
        )
        .all(db)
        .await?;
    let mut recovered = 0;
    for row in rows {
        let mut active: agent_wake::ActiveModel = row.into();
        active.status = Set(STATUS_PENDING.to_owned());
        active.claimed_at = Set(None);
        active.updated_at = Set(now);
        active.update(db).await?;
        recovered += 1;
    }
    Ok(recovered)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_helpers::{fresh_in_memory_db, seed_conversation, seed_folder};
    use crate::models::agent::AgentType;

    #[tokio::test]
    async fn cancel_is_source_scoped_and_terminal() {
        let db = fresh_in_memory_db().await;
        let folder = seed_folder(&db, "/tmp/wake-state").await;
        let source = seed_conversation(&db, folder, AgentType::Cursor).await;
        let row = create(&db.conn, CreateWake {
            source_conversation_id: source,
            source_connection_id: None,
            terminal_id: None,
            process_ref: None,
            trigger_kind: TRIGGER_AT.into(),
            fire_at: Some(Utc::now() + chrono::Duration::hours(1)),
            delay_ms: None,
            target_mode: TARGET_MODE_CURRENT.into(),
            target_conversation_ids: vec![],
            prompt: "later".into(),
            display_name: None,
            creator_kind: "user".into(),
            creator_id: None,
        }).await.unwrap();
        let cancelled = cancel(&db.conn, source, row.id).await.unwrap();
        assert_eq!(cancelled.status, STATUS_CANCELLED);
        assert_eq!(cancelled.error.as_deref(), Some("cancelled"));
        assert!(claim_due(&db.conn, Utc::now() + chrono::Duration::days(1), 10).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn persists_one_wake_with_a_fixed_multi_target_snapshot() {
        let db = fresh_in_memory_db().await;
        let folder = seed_folder(&db, "/tmp/wake-targets").await;
        let source = seed_conversation(&db, folder, AgentType::Cursor).await;
        let target = seed_conversation(&db, folder, AgentType::Codex).await;
        let row = create(
            &db.conn,
            CreateWake {
                source_conversation_id: source,
                source_connection_id: None,
                terminal_id: None,
                process_ref: None,
                trigger_kind: TRIGGER_AT.into(),
                fire_at: Some(Utc::now() + chrono::Duration::hours(1)),
                delay_ms: None,
                target_mode: TARGET_MODE_SPECIFIC_MULTIPLE.into(),
                target_conversation_ids: vec![source, target, target],
                prompt: "forward later".into(),
                display_name: None,
                creator_kind: "user".into(),
                creator_id: None,
            },
        )
        .await
        .unwrap();

        assert_eq!(row.target_mode, TARGET_MODE_SPECIFIC_MULTIPLE);
        assert_eq!(target_ids(&row).unwrap(), vec![source, target]);
        assert_eq!(list_for_source(&db.conn, source).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn rearm_timer_after_restarts_from_now() {
        let db = fresh_in_memory_db().await;
        let folder = seed_folder(&db, "/tmp/wake-rearm").await;
        let source = seed_conversation(&db, folder, AgentType::Cursor).await;
        let created = create(
            &db.conn,
            CreateWake {
                source_conversation_id: source,
                source_connection_id: None,
                terminal_id: None,
                process_ref: None,
                trigger_kind: TRIGGER_AFTER.into(),
                fire_at: Some(Utc::now() + chrono::Duration::seconds(30)),
                delay_ms: Some(30_000),
                target_mode: TARGET_MODE_CURRENT.into(),
                target_conversation_ids: vec![],
                prompt: "ping".into(),
                display_name: None,
                creator_kind: "user".into(),
                creator_id: None,
            },
        )
        .await
        .unwrap();
        mark_sent(&db.conn, created.id).await.unwrap();
        let before = Utc::now();
        let rearmed = rearm(&db.conn, source, created.id, &[]).await.unwrap();
        assert_eq!(rearmed.status, STATUS_PENDING);
        assert_eq!(rearmed.delay_ms, Some(30_000));
        let fire_at = rearmed.fire_at.expect("fire_at");
        assert!(fire_at >= before + chrono::Duration::seconds(29));
    }

    #[tokio::test]
    async fn delete_removes_inactive_wake() {
        let db = fresh_in_memory_db().await;
        let folder = seed_folder(&db, "/tmp/wake-delete").await;
        let source = seed_conversation(&db, folder, AgentType::Cursor).await;
        let row = create(
            &db.conn,
            CreateWake {
                source_conversation_id: source,
                source_connection_id: None,
                terminal_id: None,
                process_ref: None,
                trigger_kind: TRIGGER_AFTER.into(),
                fire_at: Some(Utc::now() + chrono::Duration::seconds(30)),
                delay_ms: Some(30_000),
                target_mode: TARGET_MODE_CURRENT.into(),
                target_conversation_ids: vec![],
                prompt: "ping".into(),
                display_name: None,
                creator_kind: "user".into(),
                creator_id: None,
            },
        )
        .await
        .unwrap();
        mark_sent(&db.conn, row.id).await.unwrap();
        delete(&db.conn, source, row.id).await.unwrap();
        assert!(find_scoped(&db.conn, source, row.id).await.is_err());
    }
}
