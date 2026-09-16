use serde::{Deserialize, Serialize};

use super::project::{CommandKind, Facet};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunStarted {
    pub run_id: String,
    pub project_id: String,
    pub command_id: String,
    pub profile_id: Option<String>,
    pub display_command: String,
    pub started_at: i64,
    pub status: RunStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunOutput {
    pub run_id: String,
    pub stream: OutputStream,
    pub line: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunError {
    pub run_id: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OutputStream {
    Stdout,
    Stderr,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunFinished {
    pub run_id: String,
    pub project_id: String,
    pub command_id: String,
    pub profile_id: Option<String>,
    pub profile_action: Option<CommandKind>,
    pub project_path: String,
    pub platform: Option<Facet>,
    pub channel: Option<Facet>,
    pub git_branch: Option<String>,
    pub git_commit: Option<String>,
    pub worktree_clean: Option<bool>,
    pub display_command: String,
    pub started_at: i64,
    pub finished_at: i64,
    pub duration_ms: i64,
    pub status: RunStatus,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RunStatus {
    Running,
    Succeeded,
    Failed,
    Cancelled,
}
