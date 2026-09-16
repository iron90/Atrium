use std::path::Path;

use crate::conformance::write_icon_conformance_report;
use crate::guidance::{write_project_configuration_report, write_project_guidance_reports};
use crate::model::{
    CleanupResult, IconConformanceReport, ProjectConfigurationReport, ProjectGuidanceReport,
    ProjectSnapshot, WorkspaceSnapshot,
};
use crate::scanner::{scan_project, scan_project_with_storage, scan_workspace_with_exclusions};
use crate::storage::clean_project_artifacts_selected;

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
pub fn scan_workspace_command(
    root_path: String,
    excluded_names: Option<Vec<String>>,
) -> Result<WorkspaceSnapshot, String> {
    scan_workspace_with_exclusions(Path::new(&root_path), &excluded_names.unwrap_or_default())
}

#[tauri::command]
pub async fn inspect_project_command(project_path: String) -> Result<ProjectSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        scan_project_with_storage(Path::new(&project_path), true)
            .ok_or_else(|| "Project path cannot be scanned".to_string())
    })
    .await
    .map_err(|error| format!("Project inspection task failed: {error}"))?
}

#[tauri::command]
pub async fn clean_project_artifacts_command(
    project_path: String,
    selected_paths: Option<Vec<String>>,
) -> Result<CleanupResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let project = scan_project(Path::new(&project_path))
            .ok_or_else(|| "Project path cannot be scanned".to_string())?;
        clean_project_artifacts_selected(
            Path::new(&project_path),
            &project.cleanup,
            selected_paths.as_deref(),
        )
    })
    .await
    .map_err(|error| format!("Project cleanup task failed: {error}"))?
}

#[tauri::command]
pub async fn generate_icon_conformance_report_command(
    project_path: String,
) -> Result<IconConformanceReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        write_icon_conformance_report(Path::new(&project_path))
    })
    .await
    .map_err(|error| format!("Icon conformance report task failed: {error}"))?
}

#[tauri::command]
pub async fn generate_project_configuration_report_command(
    project_path: String,
) -> Result<ProjectConfigurationReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let project = scan_project(Path::new(&project_path))
            .ok_or_else(|| "Project path cannot be scanned".to_string())?;
        write_project_configuration_report(Path::new(&project_path), &project)
    })
    .await
    .map_err(|error| format!("Project configuration report task failed: {error}"))?
}

#[tauri::command]
pub async fn generate_project_guidance_command(
    project_path: String,
) -> Result<ProjectGuidanceReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let project = scan_project(Path::new(&project_path))
            .ok_or_else(|| "Project path cannot be scanned".to_string())?;
        write_project_guidance_reports(Path::new(&project_path), &project)
    })
    .await
    .map_err(|error| format!("Project guidance task failed: {error}"))?
}
