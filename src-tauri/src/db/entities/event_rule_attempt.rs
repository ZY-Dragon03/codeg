use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "event_rule_attempt")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub rule_id: i32,
    #[sea_orm(primary_key, auto_increment = false)]
    pub conversation_id: i32,
    pub attempt_count: i32,
    pub last_fired_at: Option<DateTimeUtc>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
