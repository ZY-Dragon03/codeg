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
                "ALTER TABLE agent_wake ADD COLUMN delay_ms INTEGER NULL",
            ))
            .await?;
        manager
            .get_connection()
            .execute(Statement::from_string(
                DbBackend::Sqlite,
                "UPDATE agent_wake
                 SET delay_ms = CAST(
                   (strftime('%s', fire_at) - strftime('%s', created_at)) * 1000 AS INTEGER
                 )
                 WHERE trigger_kind = 'timer_after'
                   AND fire_at IS NOT NULL
                   AND delay_ms IS NULL",
            ))
            .await?;
        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Ok(())
    }
}
