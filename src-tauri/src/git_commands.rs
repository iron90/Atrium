use std::path::Path;

use crate::git::read_git_change_summary;
use crate::model::GitChangeSummary;

#[tauri::command]
pub async fn read_git_change_summary_command(
    project_path: String,
    from: String,
    to: Option<String>,
) -> Result<GitChangeSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        read_git_change_summary(Path::new(&project_path), &from, to.as_deref())
    })
    .await
    .map_err(|error| format!("Git change summary task failed: {error}"))?
}
