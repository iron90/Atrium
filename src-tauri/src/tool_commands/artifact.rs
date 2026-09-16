use std::path::Path;

use crate::artifacts::open_declared_artifact;

#[tauri::command]
pub async fn open_declared_artifact_command(
    project_path: String,
    profile_id: String,
    relative_path: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        open_declared_artifact(Path::new(&project_path), &profile_id, &relative_path)
    })
    .await
    .map_err(|error| format!("Open artifact task failed: {error}"))?
}
