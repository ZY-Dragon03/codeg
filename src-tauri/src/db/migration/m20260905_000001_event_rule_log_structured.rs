use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::{ConnectionTrait, DbBackend, Statement};

#[derive(DeriveMigrationName)]
pub struct Migration;

const STRUCTURED_COLUMNS: &[(&str, &str)] = &[
    ("source_conversation_id", "INTEGER"),
    ("resolved_target_id", "INTEGER"),
    ("trigger", "TEXT"),
    ("action", "TEXT"),
    ("prompt_snapshot", "TEXT"),
    ("guard_reason", "TEXT"),
];

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();

        // This migration intentionally uses PRAGMA instead of SeaORM's table
        // builder. A few installations already ran the original event-rules
        // migration before the structured columns were added, while fresh
        // databases get all columns from that original CREATE TABLE. Checking
        // each name makes both states safe and makes the migration idempotent
        // after the local compatibility repair.
        for (name, kind) in STRUCTURED_COLUMNS {
            let check = Statement::from_string(
                DbBackend::Sqlite,
                format!(
                    "SELECT COUNT(*) AS n FROM pragma_table_info('event_rule_log') \
                     WHERE name = '{name}'"
                ),
            );
            let exists = conn
                .query_one(check)
                .await?
                .map(|row| row.try_get::<i64>("", "n"))
                .transpose()?
                .unwrap_or(0)
                > 0;
            if !exists {
                conn.execute(Statement::from_string(
                    DbBackend::Sqlite,
                    format!(
                        "ALTER TABLE event_rule_log ADD COLUMN \"{name}\" {kind} NULL"
                    ),
                ))
                .await?;
            }
        }
        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        // The columns may have been supplied by the pre-migration local
        // compatibility repair. Dropping them during rollback would therefore
        // remove schema that this migration did not necessarily own.
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use sea_orm_migration::sea_orm::{ConnectionTrait, Database};

    async fn column_names(conn: &sea_orm::DatabaseConnection) -> Vec<String> {
        conn.query_all(Statement::from_string(
            DbBackend::Sqlite,
            "PRAGMA table_info(event_rule_log)".to_owned(),
        ))
        .await
        .expect("query event_rule_log schema")
        .into_iter()
        .map(|row| row.try_get::<String>("", "name").expect("column name"))
        .collect()
    }

    #[tokio::test]
    async fn up_adds_only_missing_columns_and_is_idempotent() {
        let conn = Database::connect("sqlite::memory:")
            .await
            .expect("open in-memory sqlite");
        conn.execute_unprepared(
            "CREATE TABLE event_rule_log (
                id INTEGER PRIMARY KEY,
                rule_id INTEGER NOT NULL,
                conversation_id INTEGER NOT NULL,
                kind TEXT NOT NULL,
                detail TEXT NULL,
                created_at TEXT NOT NULL,
                trigger TEXT NULL
            )",
        )
        .await
        .expect("create legacy event_rule_log");
        conn.execute_unprepared(
            "INSERT INTO event_rule_log
                (id, rule_id, conversation_id, kind, detail, created_at, trigger)
             VALUES (1, 2, 3, 'fired', 'legacy', 'now', 'turn_failed')",
        )
        .await
        .expect("insert legacy log");

        Migration
            .up(&SchemaManager::new(&conn))
            .await
            .expect("add missing columns");
        let first = column_names(&conn).await;
        assert!(first.contains(&"source_conversation_id".to_owned()));
        assert!(first.contains(&"resolved_target_id".to_owned()));
        assert!(first.contains(&"action".to_owned()));
        assert!(first.contains(&"prompt_snapshot".to_owned()));
        assert!(first.contains(&"guard_reason".to_owned()));
        assert_eq!(
            conn.query_one(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT trigger FROM event_rule_log WHERE id = 1".to_owned(),
            ))
            .await
            .expect("read preserved trigger")
            .expect("legacy row")
            .try_get::<String>("", "trigger")
            .expect("trigger value"),
            "turn_failed"
        );

        Migration
            .up(&SchemaManager::new(&conn))
            .await
            .expect("idempotent second run");
        let second = column_names(&conn).await;
        assert_eq!(first, second);
    }
}
