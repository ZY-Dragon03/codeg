use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

const BUILTIN_RETRIABLE: &str = r#"{
  "trigger": "turn_failed",
  "condition": {
    "kind": "contains",
    "match_mode": "any",
    "text_contains": [
      "RetriableError",
      "TLS",
      "connection reset",
      "temporarily unavailable",
      "Client network socket disconnected"
    ]
  },
  "action": {
    "kind": "send_to_conversation",
    "conversation_ref": "source_conversation",
    "prompt": "继续"
  },
  "guard": {
    "max_attempts": 3,
    "cooldown_ms": 5000
  }
}"#;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(EventRule::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(EventRule::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(EventRule::Name).string().not_null())
                    .col(
                        ColumnDef::new(EventRule::Enabled)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(EventRule::Priority)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .col(ColumnDef::new(EventRule::BuiltinKey).string().null())
                    .col(ColumnDef::new(EventRule::Config).text().not_null())
                    .col(
                        ColumnDef::new(EventRule::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(EventRule::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_event_rule_enabled_priority")
                    .table(EventRule::Table)
                    .col(EventRule::Enabled)
                    .col(EventRule::Priority)
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(EventRuleAttempt::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(EventRuleAttempt::RuleId)
                            .integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(EventRuleAttempt::ConversationId)
                            .integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(EventRuleAttempt::AttemptCount)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(EventRuleAttempt::LastFiredAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .primary_key(
                        Index::create()
                            .col(EventRuleAttempt::RuleId)
                            .col(EventRuleAttempt::ConversationId),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(EventRuleLog::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(EventRuleLog::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(EventRuleLog::RuleId).integer().not_null())
                    .col(
                        ColumnDef::new(EventRuleLog::ConversationId)
                            .integer()
                            .not_null(),
                    )
                    .col(ColumnDef::new(EventRuleLog::Kind).string().not_null())
                    .col(ColumnDef::new(EventRuleLog::Detail).text().null())
                    .col(ColumnDef::new(EventRuleLog::SourceConversationId).integer().null())
                    .col(ColumnDef::new(EventRuleLog::ResolvedTargetId).integer().null())
                    .col(ColumnDef::new(EventRuleLog::Trigger).string().null())
                    .col(ColumnDef::new(EventRuleLog::Action).string().null())
                    .col(ColumnDef::new(EventRuleLog::PromptSnapshot).text().null())
                    .col(ColumnDef::new(EventRuleLog::GuardReason).string().null())
                    .col(
                        ColumnDef::new(EventRuleLog::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .to_owned(),
            )
            .await?;

        let now = chrono::Utc::now().to_rfc3339();
        let sql = format!(
            "INSERT INTO event_rule (name, enabled, priority, builtin_key, config, created_at, updated_at) \
             VALUES ('Retriable network errors → auto resume', 0, 100, \
             'retriable_error_auto_resume', '{config}', '{now}', '{now}')",
            config = BUILTIN_RETRIABLE.replace('\'', "''"),
            now = now.replace('\'', "''"),
        );
        manager.get_connection().execute_unprepared(&sql).await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(EventRuleLog::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(EventRuleAttempt::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(EventRule::Table).to_owned())
            .await?;
        Ok(())
    }
}

#[derive(DeriveIden)]
enum EventRule {
    Table,
    Id,
    Name,
    Enabled,
    Priority,
    BuiltinKey,
    Config,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum EventRuleAttempt {
    Table,
    RuleId,
    ConversationId,
    AttemptCount,
    LastFiredAt,
}

#[derive(DeriveIden)]
enum EventRuleLog {
    Table,
    Id,
    RuleId,
    ConversationId,
    Kind,
    Detail,
    SourceConversationId,
    ResolvedTargetId,
    Trigger,
    Action,
    PromptSnapshot,
    GuardReason,
    CreatedAt,
}
