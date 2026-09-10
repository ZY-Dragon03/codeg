use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::{ConnectionTrait, DbBackend, Statement};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let connection = manager.get_connection();
        for (name, definition) in [
            ("target_mode", "TEXT NOT NULL DEFAULT 'current'"),
            ("target_conversation_ids", "TEXT NULL"),
        ] {
            let exists = connection
                .query_one(Statement::from_string(
                    DbBackend::Sqlite,
                    format!(
                        "SELECT COUNT(*) AS n FROM pragma_table_info('agent_wake') WHERE name = '{name}'"
                    ),
                ))
                .await?
                .map(|row| row.try_get::<i64>("", "n"))
                .transpose()?
                .unwrap_or(0);
            if exists == 0 {
                connection
                    .execute(Statement::from_string(
                        DbBackend::Sqlite,
                        format!("ALTER TABLE agent_wake ADD COLUMN {name} {definition}"),
                    ))
                    .await?;
            }
        }
        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Ok(())
    }
}
