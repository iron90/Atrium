use std::path::Path;

use crate::artifacts::open_declared_artifact;
use crate::command_boundary::run_blocking;

#[tauri::command]
pub async fn open_declared_artifact_command(
    project_path: String,
    profile_id: String,
    relative_path: String,
) -> Result<(), String> {
    run_blocking("Open artifact", move || {
        open_declared_artifact(Path::new(&project_path), &profile_id, &relative_path)
    })
    .await
}
