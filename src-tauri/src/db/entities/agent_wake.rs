use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, DeriveEntityModel)]
#[sea_orm(table_name = "agent_wake")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub source_conversation_id: i32,
    pub source_connection_id: Option<String>,
    pub terminal_id: Option<String>,
    pub process_ref: Option<String>,
    pub trigger_kind: String,
    pub fire_at: Option<DateTimeUtc>,
    pub prompt: String,
    pub status: String,
    pub claimed_at: Option<DateTimeUtc>,
    pub consumed_at: Option<DateTimeUtc>,
    pub error: Option<String>,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
