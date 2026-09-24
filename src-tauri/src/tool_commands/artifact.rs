use std::path::Path;

use tauri::State;

use crate::artifacts::open_declared_artifact;
use crate::command_boundary::run_blocking;
use crate::state::AppState;

#[tauri::command]
pub async fn open_declared_artifact_command(
    state: State<'_, AppState>,
    project_path: String,
    profile_id: String,
    relative_path: String,
) -> Result<(), String> {
    state
        .inner()
        .ensure_project_in_workspace(Path::new(&project_path))?;
    run_blocking("Open artifact", move || {
        open_declared_artifact(Path::new(&project_path), &profile_id, &relative_path)
    })
    .await
}
