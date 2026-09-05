use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::{ConnectionTrait, DbBackend, Statement};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute(Statement::from_string(
                DbBackend::Sqlite,
                "CREATE TABLE IF NOT EXISTS agent_wake (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_conversation_id INTEGER NOT NULL,
                    source_connection_id TEXT NULL,
                    terminal_id TEXT NULL,
                    process_ref TEXT NULL,
                    trigger_kind TEXT NOT NULL,
                    fire_at TEXT NULL,
                    prompt TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    claimed_at TEXT NULL,
                    consumed_at TEXT NULL,
                    error TEXT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )",
            ))
            .await?;
        manager
            .get_connection()
            .execute(Statement::from_string(
                DbBackend::Sqlite,
                "CREATE INDEX IF NOT EXISTS idx_agent_wake_due ON agent_wake(status, fire_at)",
            ))
            .await?;
        manager
            .get_connection()
            .execute(Statement::from_string(
                DbBackend::Sqlite,
                "CREATE INDEX IF NOT EXISTS idx_agent_wake_terminal ON agent_wake(status, terminal_id)",
            ))
            .await?;
        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Ok(())
    }
}
