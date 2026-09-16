use std::path::Path;

use crate::command_boundary::run_blocking;
use crate::git::read_git_change_summary;
use crate::model::GitChangeSummary;

#[tauri::command]
pub async fn read_git_change_summary_command(
    project_path: String,
    from: String,
    to: Option<String>,
) -> Result<GitChangeSummary, String> {
    run_blocking("Git change summary", move || {
        read_git_change_summary(Path::new(&project_path), &from, to.as_deref())
    })
    .await
}
