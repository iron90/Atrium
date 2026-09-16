use std::path::Path;
use std::process::Command;

use tauri::AppHandle;

use crate::artifacts::open_declared_artifact;
use crate::scanner::scan_project;

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
