use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::{ConnectionTrait, DbBackend, Statement};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        let check = Statement::from_string(
            DbBackend::Sqlite,
            "SELECT COUNT(*) AS n FROM pragma_table_info('agent_wake') WHERE name = 'display_name'",
        );
        let exists = db
            .query_one(check)
            .await?
            .map(|row| row.try_get::<i64>("", "n"))
            .transpose()?
            .unwrap_or(0)
            > 0;
        if !exists {
            db.execute(Statement::from_string(
                DbBackend::Sqlite,
                "ALTER TABLE agent_wake ADD COLUMN display_name TEXT NULL",
            ))
            .await?;
        }
        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Ok(())
    }
}
