use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "event_rule_log")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub rule_id: i32,
    pub conversation_id: i32,
    pub kind: String,
    #[sea_orm(column_type = "Text", nullable)]
    pub detail: Option<String>,
    pub source_conversation_id: Option<i32>,
    pub resolved_target_id: Option<i32>,
    #[sea_orm(column_type = "Text", nullable)]
    pub trigger: Option<String>,
    #[sea_orm(column_type = "Text", nullable)]
    pub action: Option<String>,
    #[sea_orm(column_type = "Text", nullable)]
    pub prompt_snapshot: Option<String>,
    #[sea_orm(column_type = "Text", nullable)]
    pub guard_reason: Option<String>,
    pub created_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
