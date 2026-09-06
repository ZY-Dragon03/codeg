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
pub const TRIGGER_AFTER: &str = "timer_after";
pub const TRIGGER_AT: &str = "timer_at";
pub const TRIGGER_PROCESS_EXIT: &str = "process_exit";

#[derive(Debug, Clone)]
pub struct CreateWake {
    pub source_conversation_id: i32,
    pub source_connection_id: Option<String>,
    pub terminal_id: Option<String>,
    pub process_ref: Option<String>,
    pub trigger_kind: String,
    pub fire_at: Option<DateTime<Utc>>,
    pub prompt: String,
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
    let now = Utc::now();
    let model = agent_wake::ActiveModel {
        source_conversation_id: Set(input.source_conversation_id),
        creator_kind: Set(normalize_creator_kind(&input.creator_kind)?),
        creator_id: Set(input.creator_id),
        source_connection_id: Set(input.source_connection_id),
        terminal_id: Set(input.terminal_id),
        process_ref: Set(input.process_ref),
        trigger_kind: Set(input.trigger_kind),
        fire_at: Set(input.fire_at),
        prompt: Set(input.prompt.trim().to_owned()),
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

fn normalize_creator_kind(value: &str) -> Result<String, DbError> {
    let value = value.trim().to_ascii_lowercase();
    match value.as_str() {
        "user" | "agent" => Ok(value),
        _ => Err(DbError::Validation("creator_kind must be user or agent".into())),
    }
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
    let row = agent_wake::Entity::find_by_id(id)
        .filter(agent_wake::Column::SourceConversationId.eq(source_conversation_id))
        .one(db)
        .await?
        .ok_or_else(|| DbError::NotFound(format!("agent_wake {id}")))?;
    let mut active: agent_wake::ActiveModel = row.into();
    active.status = Set(STATUS_FAILED.to_owned());
    active.error = Set(Some("cancelled".into()));
    active.updated_at = Set(Utc::now());
    Ok(active.update(db).await?)
}

/// Atomically claim due timer rows. The transaction and status predicate make
/// this safe across desktop/server scheduler restarts and duplicate ticks.
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
    let txn = db.begin().await?;
    let rows = agent_wake::Entity::find()
        .filter(agent_wake::Column::Status.eq(STATUS_PENDING))
        .filter(agent_wake::Column::TriggerKind.eq(TRIGGER_PROCESS_EXIT))
        .filter(agent_wake::Column::TerminalId.eq(terminal_id))
        .all(&txn)
        .await?;
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
            prompt: "later".into(),
            creator_kind: "user".into(),
            creator_id: None,
        }).await.unwrap();
        let cancelled = cancel(&db.conn, source, row.id).await.unwrap();
        assert_eq!(cancelled.status, STATUS_FAILED);
        assert_eq!(cancelled.error.as_deref(), Some("cancelled"));
        assert!(claim_due(&db.conn, Utc::now() + chrono::Duration::days(1), 10).await.unwrap().is_empty());
    }
}
