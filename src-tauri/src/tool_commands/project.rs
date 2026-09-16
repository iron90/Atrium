use std::path::Path;
use std::process::Command;

use crate::os_open;

#[tauri::command]
pub async fn open_project_directory_command(project_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || open_path(Path::new(&project_path)))
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

fn open_path(path: &Path) -> Result<(), String> {
    if !path.is_dir() {
        return Err("Project path is not a directory".to_string());
    }
    os_open::open_path(path)
        .map(|_| ())
        .map_err(|error| format!("Cannot open project directory: {error}"))
}
