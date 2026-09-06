use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::{ConnectionTrait, DbBackend, Statement};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        for (name, kind) in [
            ("creator_kind", "TEXT NOT NULL DEFAULT 'user'"),
            ("creator_conversation_id", "INTEGER NULL"),
        ] {
            let check = Statement::from_string(
                DbBackend::Sqlite,
                format!(
                    "SELECT COUNT(*) AS n FROM pragma_table_info('event_rule') WHERE name = '{name}'"
                ),
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
                    format!("ALTER TABLE event_rule ADD COLUMN \"{name}\" {kind}"),
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
