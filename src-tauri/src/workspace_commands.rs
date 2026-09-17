use std::path::Path;

use tauri::{AppHandle, Emitter, State};

use crate::command_boundary::run_blocking;
use crate::guidance::{write_project_configuration_report, write_project_guidance_reports};
use crate::model::{
    CleanupResult, ProjectConfigurationReport, ProjectGuidanceReport, ProjectSnapshot,
    WorkspaceSnapshot,
};
use crate::scanner::{scan_project, scan_project_with_storage, scan_workspace_with_exclusions};
use crate::state::AppState;
use crate::storage::clean_project_artifacts_selected_with_progress;

#[tauri::command]
pub fn default_workspace_path_command() -> String {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    let preferred = Path::new(&home).join("Z-Project");
    if preferred.is_dir() {
        preferred.to_string_lossy().to_string()
    } else {
        home
    }
}

#[tauri::command]
pub async fn scan_workspace_command(
    root_path: String,
    excluded_names: Option<Vec<String>>,
) -> Result<WorkspaceSnapshot, String> {
    let excluded_names = excluded_names.unwrap_or_default();
    run_blocking("Workspace scan", move || {
        scan_workspace_with_exclusions(Path::new(&root_path), &excluded_names)
    })
    .await
}

#[tauri::command]
pub async fn inspect_project_command(
    state: State<'_, AppState>,
    project_path: String,
) -> Result<ProjectSnapshot, String> {
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
pub async fn generate_project_configuration_report_command(
    project_path: String,
) -> Result<ProjectConfigurationReport, String> {
    run_blocking("Project configuration report", move || {
        let project = scan_project(Path::new(&project_path))
            .ok_or_else(|| "Project path cannot be scanned".to_string())?;
        write_project_configuration_report(Path::new(&project_path), &project)
    })
    .await
}

#[tauri::command]
pub async fn generate_project_guidance_command(
    project_path: String,
) -> Result<ProjectGuidanceReport, String> {
    run_blocking("Project guidance", move || {
        let project = scan_project(Path::new(&project_path))
            .ok_or_else(|| "Project path cannot be scanned".to_string())?;
        write_project_guidance_reports(Path::new(&project_path), &project)
    })
    .await
}
