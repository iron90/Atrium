use std::path::Path;
use std::process::Command;

use crate::command_boundary::run_blocking;
use crate::os_open;
use crate::project_path::canonical_project_root;

#[tauri::command]
pub async fn open_project_directory_command(project_path: String) -> Result<(), String> {
    run_blocking("Open project", move || {
        let root = canonical_project_root(Path::new(&project_path))?;
        open_path(&root)
    })
    .await
}

#[tauri::command]
pub async fn open_project_terminal_command(
    project_path: String,
    terminal: Option<String>,
) -> Result<(), String> {
    run_blocking("Open terminal", move || {
        let root = canonical_project_root(Path::new(&project_path))?;
        if let Some(program) = terminal.filter(|value| !value.trim().is_empty()) {
            return Command::new(program.trim())
                .current_dir(&root)
                .spawn()
                .map(|_| ())
                .map_err(|error| format!("Cannot open configured terminal: {error}"));
        }
        let root_string = root.to_string_lossy().into_owned();
        #[cfg(target_os = "macos")]
        {
            return Command::new("open")
                .args(["-a", "Terminal", &root_string])
                .spawn()
                .map(|_| ())
                .map_err(|error| format!("Cannot open Terminal: {error}"));
        }
        #[cfg(target_os = "windows")]
        {
            return Command::new("wt.exe")
                .args(["-d", &root_string])
                .spawn()
                .map(|_| ())
                .map_err(|error| format!("Cannot open Windows Terminal: {error}"));
        }
        #[cfg(all(unix, not(target_os = "macos")))]
        {
            let program =
                std::env::var("TERMINAL").unwrap_or_else(|_| "x-terminal-emulator".to_string());
            return Command::new(program)
                .current_dir(&root)
                .spawn()
                .map(|_| ())
                .map_err(|error| format!("Cannot open terminal: {error}"));
        }
        #[allow(unreachable_code)]
        Err("Terminal opening is not supported on this platform".to_string())
    })
    .await
}

fn open_path(path: &Path) -> Result<(), String> {
    os_open::open_path(path)
        .map(|_| ())
        .map_err(|error| format!("Cannot open project directory: {error}"))
}
