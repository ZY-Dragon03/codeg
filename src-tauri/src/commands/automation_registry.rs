use crate::db::error::DbError;
use crate::db::service::automation_registry::{self, AutomationRegistryItem};
use crate::db::AppDatabase;

pub async fn automation_registry_list_core(
    db: &AppDatabase,
) -> Result<Vec<AutomationRegistryItem>, DbError> {
    automation_registry::list(&db.conn).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn automation_registry_list(
    db: tauri::State<'_, AppDatabase>,
) -> Result<Vec<AutomationRegistryItem>, DbError> {
    automation_registry_list_core(&db).await
}
