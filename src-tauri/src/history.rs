use std::cmp::Reverse;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use tauri::{AppHandle, Manager};

use crate::model::RunFinished;

const MAX_RUN_HISTORY: usize = 100;

pub fn load_run_history(app: &AppHandle) -> Result<Vec<RunFinished>, String> {
    let path = history_path(app)?;
    match fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str(&raw)
            .map_err(|error| format!("Cannot parse Atrium run history: {error}")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(format!("Cannot read Atrium run history: {error}")),
    }
}

pub fn append_run_history(app: &AppHandle, finished: &RunFinished) -> Result<(), String> {
    let mut history = load_run_history(app)?;
    history.retain(|record| record.run_id != finished.run_id);
    history.push(finished.clone());
    history.sort_by_key(|record| Reverse(record.finished_at));
    history.truncate(MAX_RUN_HISTORY);

    let path = history_path(app)?;
    let parent = path
        .parent()
        .ok_or_else(|| "Cannot determine Atrium history directory".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Cannot create Atrium history directory: {error}"))?;
    let raw = serde_json::to_string_pretty(&history)
        .map_err(|error| format!("Cannot serialize Atrium run history: {error}"))?;
    fs::write(&path, raw).map_err(|error| format!("Cannot write Atrium run history: {error}"))
}

pub fn open_run_log(app: &AppHandle, run_id: &str) -> Result<(), String> {
    let record = load_run_history(app)?
        .into_iter()
        .find(|record| record.run_id == run_id)
        .ok_or_else(|| "Run record is no longer available".to_string())?;
    if run_id.is_empty() || run_id.contains(['/', '\\']) {
        return Err("Invalid run id".to_string());
    }

    let logs_directory = history_path(app)?
        .parent()
        .ok_or_else(|| "Cannot determine Atrium log directory".to_string())?
        .join("logs");
    fs::create_dir_all(&logs_directory)
        .map_err(|error| format!("Cannot create Atrium log directory: {error}"))?;
    let log_path = logs_directory.join(format!("{run_id}.log"));
    fs::write(&log_path, render_log(&record))
        .map_err(|error| format!("Cannot write run log: {error}"))?;
    open_path(&log_path)
}

fn history_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Cannot resolve Atrium data directory: {error}"))?
        .join("run-history.json"))
}

fn render_log(record: &RunFinished) -> String {
    let mut output = format!(
        "Atrium run log\n\nProject: {}\nProject path: {}\nCommand: {}\nStatus: {:?}\nExit code: {:?}\nStarted: {}\nFinished: {}\nDuration: {} ms\n",
        record.project_id,
        record.project_path,
        record.display_command,
        record.status,
        record.exit_code,
        record.started_at,
        record.finished_at,
        record.duration_ms,
    );
    if let Some(profile_id) = &record.profile_id {
        output.push_str(&format!("Profile: {profile_id}\n"));
    }
    if let Some(action) = &record.profile_action {
        output.push_str(&format!("Profile action: {action:?}\n"));
    }
    if let Some(platform) = &record.platform {
        output.push_str(&format!("Platform: {}\n", platform.label));
    }
    if let Some(channel) = &record.channel {
        output.push_str(&format!("Channel: {}\n", channel.label));
    }
    if let Some(branch) = &record.git_branch {
        output.push_str(&format!("Git branch: {branch}\n"));
    }
    if let Some(commit) = &record.git_commit {
        output.push_str(&format!("Git commit: {commit}\n"));
    }
    if let Some(clean) = record.worktree_clean {
        output.push_str(&format!("Worktree clean: {clean}\n"));
    }
    output.push_str("\n--- stdout ---\n");
    output.push_str(&record.stdout);
    output.push_str("\n--- stderr ---\n");
    output.push_str(&record.stderr);
    output
}

fn open_path(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let (program, argument) = ("open", path.to_string_lossy().to_string());
    #[cfg(target_os = "windows")]
    let (program, argument) = ("explorer", path.to_string_lossy().to_string());
    #[cfg(all(unix, not(target_os = "macos")))]
    let (program, argument) = ("xdg-open", path.to_string_lossy().to_string());

    Command::new(program)
        .arg(argument)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Cannot open run log: {error}"))
}
