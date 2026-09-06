use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::{ConnectionTrait, DbBackend, Statement};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        // SQLite has no portable IF NOT EXISTS form for ADD COLUMN. The
        // migration table guarantees this runs once on upgraded databases,
        // while the CREATE TABLE migration already includes these columns on
        // fresh installs.
        db.execute(Statement::from_string(
            DbBackend::Sqlite,
            "ALTER TABLE agent_wake ADD COLUMN creator_kind TEXT NOT NULL DEFAULT 'user'",
        ))
        .await?;
        db.execute(Statement::from_string(
            DbBackend::Sqlite,
            "ALTER TABLE agent_wake ADD COLUMN creator_id TEXT NULL",
        ))
        .await?;
        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Ok(())
    }
}
