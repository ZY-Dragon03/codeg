//! Phase 1 event-driven automation (lifecycle rules).

pub mod dedup;
pub mod engine;
pub mod handle;
pub mod matcher;
pub mod types;

pub use engine::EventRulesEngine;
pub use handle::EventRulesEngineHandle;
