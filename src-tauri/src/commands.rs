use std::path::Path;
use std::process::Command;

use tauri::{AppHandle, State};

use crate::artifacts::open_declared_artifact;
use crate::conformance::write_icon_conformance_report;
use crate::git::read_git_change_summary;
use crate::history::{load_run_history, open_run_log};
use crate::manifest::{write_project_configuration_report, write_project_guidance_reports};
use crate::model::{
    CleanupResult, CommandKind, GitChangeSummary, IconConformanceReport,
    ProjectConfigurationReport, ProjectGuidanceReport, ProjectSnapshot, RunStarted,
    WorkspaceSnapshot,
};
use crate::runner::{start_project_command, stop_project_run};
use crate::scanner::{scan_project, scan_project_with_storage, scan_workspace_with_exclusions};
use crate::state::AppState;
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

#[tauri::command]
pub async fn run_project_command(
    app: AppHandle,
    state: State<'_, AppState>,
    project_path: String,
    command_id: String,
    profile_id: Option<String>,
    profile_action: Option<CommandKind>,
) -> Result<RunStarted, String> {
    start_project_command(
        app,
        state.inner().clone(),
        project_path,
        command_id,
        profile_id,
        profile_action,
    )
    .await
}

#[tauri::command]
pub fn stop_project_command(state: State<'_, AppState>, run_id: String) -> Result<(), String> {
    stop_project_run(state.inner(), &run_id)
}

#[tauri::command]
pub async fn list_run_history_command(
    app: AppHandle,
) -> Result<Vec<crate::model::RunFinished>, String> {
    tauri::async_runtime::spawn_blocking(move || load_run_history(&app))
        .await
        .map_err(|error| format!("Run history task failed: {error}"))?
}

#[tauri::command]
pub async fn open_run_log_command(app: AppHandle, run_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || open_run_log(&app, &run_id))
        .await
        .map_err(|error| format!("Open run log task failed: {error}"))?
}

#[tauri::command]
pub async fn open_declared_artifact_command(
    app: AppHandle,
    project_path: String,
    profile_id: String,
    relative_path: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        open_declared_artifact(&app, Path::new(&project_path), &profile_id, &relative_path)
    })
    .await
    .map_err(|error| format!("Open artifact task failed: {error}"))?
}

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

#[tauri::command]
pub async fn open_project_directory_command(
    app: AppHandle,
    project_path: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || open_path(&app, Path::new(&project_path)))
        .await
        .map_err(|error| format!("Open project task failed: {error}"))?
}

#[tauri::command]
pub async fn open_project_terminal_command(
    project_path: String,
    terminal: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(program) = terminal.filter(|value| !value.trim().is_empty()) {
            return Command::new(program.trim())
                .current_dir(&project_path)
                .spawn()
                .map(|_| ())
                .map_err(|error| format!("Cannot open configured terminal: {error}"));
        }
        #[cfg(target_os = "macos")]
        {
            return Command::new("open")
                .args(["-a", "Terminal", &project_path])
                .spawn()
                .map(|_| ())
                .map_err(|error| format!("Cannot open Terminal: {error}"));
        }
        #[cfg(target_os = "windows")]
        {
            return Command::new("wt.exe")
                .args(["-d", &project_path])
                .spawn()
                .map(|_| ())
                .map_err(|error| format!("Cannot open Windows Terminal: {error}"));
        }
        #[cfg(all(unix, not(target_os = "macos")))]
        {
            let program =
                std::env::var("TERMINAL").unwrap_or_else(|_| "x-terminal-emulator".to_string());
            return Command::new(program)
                .current_dir(&project_path)
                .spawn()
                .map(|_| ())
                .map_err(|error| format!("Cannot open terminal: {error}"));
        }
        #[allow(unreachable_code)]
        Err("Terminal opening is not supported on this platform".to_string())
    })
    .await
    .map_err(|error| format!("Open terminal task failed: {error}"))?
}

#[tauri::command]
pub async fn open_project_remote_command(app: AppHandle, remote: String) -> Result<(), String> {
    let url = normalize_remote(&remote)?;
    tauri::async_runtime::spawn_blocking(move || open_external(&app, &url))
        .await
        .map_err(|error| format!("Open remote task failed: {error}"))?
}

#[tauri::command]
pub async fn open_project_link_command(
    app: AppHandle,
    project_path: String,
    link_id: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let project = scan_project(Path::new(&project_path))
            .ok_or_else(|| "Project path cannot be scanned".to_string())?;
        let link = project
            .links
            .iter()
            .find(|link| link.id == link_id)
            .ok_or_else(|| "Project link is not declared in the manifest".to_string())?;
        open_external(&app, &link.url)
    })
    .await
    .map_err(|error| format!("Open project link task failed: {error}"))?
}

fn open_path(_app: &AppHandle, path: &Path) -> Result<(), String> {
    if !path.is_dir() {
        return Err("Project path is not a directory".to_string());
    }
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(path);
        command
    };
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("explorer");
        command.arg(path);
        command
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(path);
        command
    };
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Cannot open project directory: {error}"))
}

fn open_external(_app: &AppHandle, url: &str) -> Result<(), String> {
    if !(url.starts_with("http://") || url.starts_with("https://") || url.starts_with("file://")) {
        return Err("Only http://, https://, and file:// links can be opened".to_string());
    }
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(url);
        command
    };
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("rundll32");
        command.args(["url.dll,FileProtocolHandler", url]);
        command
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(url);
        command
    };
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Cannot open link: {error}"))
}

fn normalize_remote(remote: &str) -> Result<String, String> {
    let value = remote.trim();
    if value.starts_with("http://") || value.starts_with("https://") || value.starts_with("file://")
    {
        return Ok(value.to_string());
    }
    if let Some(rest) = value.strip_prefix("git@") {
        if let Some((host, path)) = rest.split_once(':') {
            return Ok(format!("https://{host}/{path}")
                .trim_end_matches(".git")
                .to_string());
        }
    }
    Err("The Git remote is not a supported browsable URL".to_string())
}
