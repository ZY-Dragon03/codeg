//! Process-wide handle so CRUD paths can hot-reload rules without restart.

use std::sync::{Arc, OnceLock};

use crate::db::error::DbError;

use super::EventRulesEngine;

#[derive(Clone, Default)]
pub struct EventRulesEngineHandle {
    inner: Arc<OnceLock<Arc<EventRulesEngine>>>,
}

impl EventRulesEngineHandle {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(OnceLock::new()),
        }
    }

    pub fn set(&self, engine: Arc<EventRulesEngine>) {
        let _ = self.inner.set(engine);
    }

    pub async fn reload_rules(&self) -> Result<(), DbError> {
        if let Some(engine) = self.inner.get() {
            return engine.reload_rules().await;
        }
        Err(DbError::Validation(
            "event rules engine is not initialized".into(),
        ))
    }

    pub async fn target_available(&self, conversation_id: i32) -> bool {
        if let Some(engine) = self.inner.get() {
            engine.target_available(conversation_id).await
        } else {
            false
        }
    }

    #[cfg(any(test, feature = "test-utils"))]
    pub fn get(&self) -> Option<Arc<EventRulesEngine>> {
        self.inner.get().cloned()
    }
}
