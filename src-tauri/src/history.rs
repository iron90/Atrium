use std::cmp::Reverse;
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::model::RunFinished;
use crate::os_open;
use crate::run_validation::validate_run_id;
use crate::time::now_millis;

const MAX_RUN_HISTORY: usize = 100;
const MAX_RUN_HISTORY_BYTES: u64 = 64 * 1024 * 1024;

pub fn load_run_history(app: &AppHandle) -> Result<Vec<RunFinished>, String> {
    let path = history_path(app)?;
    read_history_file(&path)
}

// A corrupt or oversized history file must never wedge the history forever:
// it is moved aside under a `.corrupt-` name and history resumes empty.
fn read_history_file(path: &Path) -> Result<Vec<RunFinished>, String> {
    match fs::metadata(path) {
        Ok(metadata) if metadata.len() > MAX_RUN_HISTORY_BYTES => {
            quarantine_history(path);
            Ok(Vec::new())
        }
        Ok(_) => match fs::read_to_string(path) {
            Ok(raw) => match serde_json::from_str(&raw) {
                Ok(history) => Ok(history),
                Err(parse_error) => {
                    eprintln!("Atrium quarantined an unreadable run history file: {parse_error}");
                    quarantine_history(path);
                    Ok(Vec::new())
                }
            },
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
            Err(error) => Err(format!("Cannot read Atrium run history: {error}")),
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(format!("Cannot inspect Atrium run history: {error}")),
    }
}

fn quarantine_history(path: &Path) {
    let quarantined = path.with_extension(format!("json.corrupt-{}", now_millis()));
    if let Err(error) = fs::rename(path, &quarantined) {
        eprintln!(
            "Atrium could not quarantine the run history file {}: {error}",
            quarantined.display()
        );
    }
}

pub fn append_run_history(app: &AppHandle, finished: &RunFinished) -> Result<(), String> {
    append_history_file(&history_path(app)?, finished)
}

fn append_history_file(path: &Path, finished: &RunFinished) -> Result<(), String> {
    let mut history = read_history_file(path)?;
    history = merge_run_history(history, finished);

    let parent = path
        .parent()
        .ok_or_else(|| "Cannot determine Atrium history directory".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Cannot create Atrium history directory: {error}"))?;
    let raw = serde_json::to_string_pretty(&history)
        .map_err(|error| format!("Cannot serialize Atrium run history: {error}"))?;
    write_file_atomically(path, &raw)
        .map_err(|error| format!("Cannot write Atrium run history: {error}"))?;
    prune_run_logs(parent, &history);
    Ok(())
}

// Only the newest records stay reachable in the history file, so log files
// beyond them would accumulate forever.
fn prune_run_logs(parent: &Path, history: &[RunFinished]) {
    let logs_directory = parent.join("logs");
    let Ok(entries) = fs::read_dir(&logs_directory) else {
        return;
    };
    let live_run_ids: std::collections::HashSet<String> =
        history.iter().map(|record| record.run_id.clone()).collect();
    for entry in entries.flatten() {
        let file_name = entry.file_name().to_string_lossy().into_owned();
        let Some(stem) = file_name.strip_suffix(".log") else {
            continue;
        };
        if !live_run_ids.contains(stem) {
            let _ = fs::remove_file(entry.path());
        }
    }
}

pub fn with_history_lock<T, F>(lock: &Mutex<()>, task: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String>,
{
    let _guard = lock
        .lock()
        .map_err(|_| "Atrium run history is unavailable".to_string())?;
    task()
}

fn merge_run_history(mut history: Vec<RunFinished>, finished: &RunFinished) -> Vec<RunFinished> {
    history.retain(|record| record.run_id != finished.run_id);
    history.push(finished.clone());
    history.sort_by_key(|record| Reverse(record.finished_at));
    history.truncate(MAX_RUN_HISTORY);
    history
}

pub fn open_run_log(app: &AppHandle, run_id: &str) -> Result<(), String> {
    validate_run_id(run_id)?;
    let record = load_run_history(app)?
        .into_iter()
        .find(|record| record.run_id == run_id)
        .ok_or_else(|| "Run record is no longer available".to_string())?;

    let logs_directory = history_path(app)?
        .parent()
        .ok_or_else(|| "Cannot determine Atrium log directory".to_string())?
        .join("logs");
    fs::create_dir_all(&logs_directory)
        .map_err(|error| format!("Cannot create Atrium log directory: {error}"))?;
    let log_path = logs_directory.join(format!("{run_id}.log"));
    write_file_atomically(&log_path, &render_log(&record))
        .map_err(|error| format!("Cannot write run log: {error}"))?;
    os_open::open_path(&log_path).map_err(|error| format!("Cannot open run log: {error}"))
}

fn history_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Cannot resolve Atrium data directory: {error}"))?
        .join("run-history.json"))
}

fn write_file_atomically(path: &Path, content: &str) -> std::io::Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| std::io::Error::other("target has no parent directory"))?;
    let temporary_path = parent.join(format!(".atrium-write-{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut temporary = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary_path)?;
        temporary.write_all(content.as_bytes())?;
        temporary.sync_all()?;
        drop(temporary);
        replace_file(&temporary_path, path)
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    result
}

#[cfg(not(windows))]
fn replace_file(source: &Path, target: &Path) -> std::io::Result<()> {
    fs::rename(source, target)
}

#[cfg(windows)]
fn replace_file(source: &Path, target: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let source = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let target = target
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let flags = MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH;
    let replaced = unsafe { MoveFileExW(source.as_ptr(), target.as_ptr(), flags) };
    if replaced == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
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

#[cfg(test)]
mod tests {
    use super::{
        append_history_file, merge_run_history, prune_run_logs, read_history_file,
        write_file_atomically, MAX_RUN_HISTORY_BYTES,
    };
    use crate::model::{RunFinished, RunStatus};
    use std::fs;
    use std::fs::OpenOptions;

    fn record(run_id: &str, finished_at: i64) -> RunFinished {
        RunFinished {
            run_id: run_id.to_string(),
            project_id: "project".to_string(),
            command_id: "command".to_string(),
            profile_id: None,
            profile_action: None,
            project_path: "/project".to_string(),
            platform: None,
            channel: None,
            git_branch: None,
            git_commit: None,
            worktree_clean: None,
            display_command: "command".to_string(),
            started_at: finished_at - 1,
            finished_at,
            duration_ms: 1,
            status: RunStatus::Succeeded,
            exit_code: Some(0),
            stdout: String::new(),
            stderr: String::new(),
        }
    }

    #[test]
    fn replaces_duplicate_records_and_orders_newest_first() {
        let result = merge_run_history(
            vec![record("old", 10), record("same", 20)],
            &record("same", 30),
        );

        assert_eq!(
            result
                .iter()
                .map(|record| record.run_id.as_str())
                .collect::<Vec<_>>(),
            vec!["same", "old"]
        );
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].finished_at, 30);
    }

    #[test]
    fn retains_only_the_newest_hundred_records() {
        let history = (0..100)
            .map(|index| record(&format!("run-{index}"), index))
            .collect();

        let result = merge_run_history(history, &record("new", 100));

        assert_eq!(result.len(), 100);
        assert_eq!(result[0].run_id, "new");
        assert!(!result.iter().any(|record| record.run_id == "run-0"));
    }

    #[test]
    fn replaces_history_file_without_exposing_partial_content() {
        let root =
            std::env::temp_dir().join(format!("atrium-history-write-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create history fixture");
        let path = root.join("run-history.json");
        fs::write(&path, "old history").expect("write old history");

        write_file_atomically(&path, "new history").expect("replace history atomically");

        assert_eq!(
            fs::read_to_string(&path).expect("read replaced history"),
            "new history"
        );
        fs::remove_dir_all(root).expect("remove history fixture");
    }

    #[test]
    fn quarantines_oversized_history_files_and_resumes_empty() {
        let root =
            std::env::temp_dir().join(format!("atrium-history-size-limit-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create history fixture");
        let path = root.join("run-history.json");
        let file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&path)
            .expect("create oversized history fixture");
        file.set_len(MAX_RUN_HISTORY_BYTES + 1)
            .expect("extend oversized history fixture");
        drop(file);

        let history = read_history_file(&path).expect("oversized history self-heals");

        assert!(history.is_empty());
        assert!(!path.exists(), "the oversized file was moved aside");
        assert!(fs::read_dir(&root)
            .expect("list history directory")
            .flatten()
            .any(|entry| entry.file_name().to_string_lossy().contains("corrupt")));
        fs::remove_dir_all(root).expect("remove history fixture");
    }

    #[test]
    fn quarantines_corrupt_history_files_and_appends_fresh_records() {
        let root =
            std::env::temp_dir().join(format!("atrium-history-corrupt-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create history fixture");
        let path = root.join("run-history.json");
        fs::write(&path, "{ not json").expect("write corrupt history");

        let history = read_history_file(&path).expect("corrupt history self-heals");
        assert!(history.is_empty());

        append_history_file(&path, &record("fresh", 5)).expect("append after self-heal");
        let history = read_history_file(&path).expect("read healed history");
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].run_id, "fresh");
        assert!(fs::read_dir(&root)
            .expect("list history directory")
            .flatten()
            .any(|entry| entry.file_name().to_string_lossy().contains("corrupt")));

        fs::remove_dir_all(root).expect("remove history fixture");
    }

    #[test]
    fn prunes_log_files_without_a_live_history_record() {
        let root = std::env::temp_dir().join(format!("atrium-history-logs-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("logs")).expect("create logs fixture");
        let path = root.join("run-history.json");
        append_history_file(&path, &record("kept", 5)).expect("append a live record");
        fs::write(root.join("logs/kept.log"), "live").expect("write live log");
        fs::write(root.join("logs/orphan.log"), "orphan").expect("write orphan log");

        prune_run_logs(&root, &read_history_file(&path).expect("read history"));

        assert!(root.join("logs/kept.log").exists());
        assert!(!root.join("logs/orphan.log").exists());

        fs::remove_dir_all(root).expect("remove history fixture");
    }
}
