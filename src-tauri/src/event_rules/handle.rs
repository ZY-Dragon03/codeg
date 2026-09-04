//! Process-wide handle so CRUD paths can hot-reload rules without restart.

use std::sync::{Arc, OnceLock};

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

    pub async fn reload_rules(&self) {
        if let Some(engine) = self.inner.get() {
            engine.reload_rules().await;
        }
    }

    #[cfg(any(test, feature = "test-utils"))]
    pub fn get(&self) -> Option<Arc<EventRulesEngine>> {
        self.inner.get().cloned()
    }
}
