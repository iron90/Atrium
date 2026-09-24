use std::path::{Path, PathBuf};

use tauri::{AppHandle, Emitter, State};

use crate::command_boundary::run_blocking;
use crate::guidance::write_project_guidance_reports;
use crate::model::{CleanupResult, ProjectGuidanceReport, ProjectSnapshot, WorkspaceSnapshot};
use crate::scanner::{scan_project, scan_project_with_storage, scan_workspace_with_exclusions};
use crate::state::AppState;
use crate::storage::clean_project_artifacts_selected_with_progress;

#[tauri::command]
pub async fn scan_workspace_command(
    state: State<'_, AppState>,
    root_path: String,
    excluded_names: Option<Vec<String>>,
) -> Result<WorkspaceSnapshot, String> {
    let excluded_names = excluded_names.unwrap_or_default();
    let app_state = state.inner().clone();
    let snapshot = run_blocking("Workspace scan", move || {
        scan_workspace_with_exclusions(Path::new(&root_path), &excluded_names)
    })
    .await?;
    app_state.register_workspace_root(PathBuf::from(&snapshot.root_path));
    Ok(snapshot)
}

#[tauri::command]
pub async fn inspect_project_command(
    state: State<'_, AppState>,
    project_path: String,
) -> Result<ProjectSnapshot, String> {
    state
        .inner()
        .ensure_project_in_workspace(Path::new(&project_path))?;
    let inspection_permit = state
        .inner()
        .project_inspection_gate
        .clone()
        .acquire_owned()
        .await
        .map_err(|_| "Project inspection gate is unavailable".to_string())?;
    run_blocking("Project inspection", move || {
        let _inspection_permit = inspection_permit;
        scan_project_with_storage(Path::new(&project_path), true)
            .ok_or_else(|| "Project path cannot be scanned".to_string())
    })
    .await
}

#[tauri::command]
pub async fn clean_project_artifacts_command(
    app: AppHandle,
    state: State<'_, AppState>,
    project_path: String,
    selected_paths: Option<Vec<String>>,
) -> Result<CleanupResult, String> {
    state
        .inner()
        .ensure_project_in_workspace(Path::new(&project_path))?;
    let inspection_permit = state
        .inner()
        .project_inspection_gate
        .clone()
        .acquire_owned()
        .await
        .map_err(|_| "Project inspection gate is unavailable".to_string())?;
    run_blocking("Project cleanup", move || {
        let _inspection_permit = inspection_permit;
        let project = scan_project(Path::new(&project_path))
            .ok_or_else(|| "Project path cannot be scanned".to_string())?;
        clean_project_artifacts_selected_with_progress(
            Path::new(&project_path),
            &project.cleanup,
            selected_paths.as_deref(),
            |progress| {
                if let Err(error) = app.emit("cleanup-progress", &progress) {
                    eprintln!("Atrium could not emit cleanup progress: {error}");
                }
            },
        )
    })
    .await
}

#[tauri::command]
pub async fn generate_project_guidance_command(
    state: State<'_, AppState>,
    project_path: String,
) -> Result<ProjectGuidanceReport, String> {
    state
        .inner()
        .ensure_project_in_workspace(Path::new(&project_path))?;
    run_blocking("Project guidance", move || {
        let project = scan_project(Path::new(&project_path))
            .ok_or_else(|| "Project path cannot be scanned".to_string())?;
        write_project_guidance_reports(Path::new(&project_path), &project)
    })
    .await
}
