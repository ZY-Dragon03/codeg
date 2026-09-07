use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalEvent {
    pub terminal_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalInfo {
    pub id: String,
    pub title: String,
    pub working_dir: Option<String>,
    pub initial_command: Option<String>,
    pub shell: Option<String>,
    pub owner_window_label: Option<String>,
    pub created_at: Option<String>,
}
