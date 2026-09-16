use std::process::Stdio;

use futures_util::future::{select, Either};
use futures_util::pin_mut;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::process::Command;
use tokio::sync::oneshot;
use uuid::Uuid;

use crate::history::append_run_history;
use crate::model::{
    CommandKind, Facet, OutputStream, ProjectCommand, ProjectConfigurationStatus, RunFinished,
    RunOutput, RunStarted, RunStatus,
};
use crate::scanner::scan_project;
use crate::state::{AppState, RunControl};
use crate::time::now_millis;

pub async fn start_project_command(
    app: AppHandle,
    state: AppState,
    project_path: String,
    command_id: String,
    profile_id: Option<String>,
    profile_action: Option<CommandKind>,
) -> Result<RunStarted, String> {
    let project = scan_project(std::path::Path::new(&project_path))
        .ok_or_else(|| "Project path cannot be scanned".to_string())?;
    let command = project
        .commands
        .iter()
        .find(|candidate| candidate.id == command_id)
        .cloned()
        .ok_or_else(|| "Command is not present in the scanned project".to_string())?;
    let mut profile_platform: Option<Facet> = None;
    let mut profile_channel: Option<Facet> = None;
    if let Some(profile_id) = profile_id.as_deref() {
        if project.configuration.status != ProjectConfigurationStatus::Configured {
            return Err("Project configuration is not valid for profile execution".to_string());
        }
        let profile = project
            .build_profiles
            .iter()
            .find(|profile| profile.id == profile_id)
            .ok_or_else(|| "Build profile is not declared in the scanned project".to_string())?;
        let action = profile_action
            .as_ref()
            .ok_or_else(|| "A profile action is required for a profile command".to_string())?;
        if profile.command_id_for_action(action) != Some(command.id.as_str()) {
            return Err(format!(
                "Command {} is not bound to the {} action of build profile {}",
                command.id,
                format_command_kind(action),
                profile.id
            ));
        }
        if !profile.issues.is_empty() {
            return Err(format!(
                "Build profile {} is invalid: {}",
                profile.id,
                profile.issues.join(" ")
            ));
        }
        profile_platform = Some(profile.platform.clone());
        profile_channel = Some(profile.channel.clone());
    }
    let git_branch = project.repo.as_ref().and_then(|repo| repo.branch.clone());
    let git_commit = project
        .repo
        .as_ref()
        .and_then(|repo| repo.last_commit.as_ref())
        .map(|commit| commit.sha.clone());
    let worktree_clean = project.repo.as_ref().map(|repo| repo.is_clean);

    let run_id = Uuid::new_v4().to_string();
    let started_at = now_millis();
    let mut child = build_process(&command)?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let (stop_tx, stop_rx) = oneshot::channel();
    state
        .runs
        .lock()
        .map_err(|_| "Run registry is unavailable".to_string())?
        .insert(run_id.clone(), RunControl { stop: stop_tx });

    let started = RunStarted {
        run_id: run_id.clone(),
        project_id: project.id.clone(),
        command_id: command.id.clone(),
        profile_id: profile_id.clone(),
        display_command: command.display_command.clone(),
        started_at,
        status: RunStatus::Running,
    };
    app.emit("run-started", &started)
        .map_err(|error| format!("Cannot emit run-started: {error}"))?;

    let app_for_task = app.clone();
    let state_for_task = state.clone();
    tauri::async_runtime::spawn(async move {
        let finished = supervise_process(
            app_for_task.clone(),
            &run_id,
            project.id,
            command,
            profile_id,
            profile_action,
            project.path,
            profile_platform,
            profile_channel,
            git_branch,
            git_commit,
            worktree_clean,
            started_at,
            &mut child,
            stdout,
            stderr,
            stop_rx,
        )
        .await;
        if let Ok(mut runs) = state_for_task.runs.lock() {
            runs.remove(&run_id);
        }
        if let Ok(finished) = finished {
            let _ = append_run_history(&app_for_task, &finished);
            let _ = app_for_task.emit("run-finished", finished);
        }
    });

    Ok(started)
}

fn format_command_kind(kind: &CommandKind) -> &'static str {
    match kind {
        CommandKind::Run => "run",
        CommandKind::Check => "check",
        CommandKind::Build => "build",
        CommandKind::Other => "other",
    }
}

pub fn stop_project_run(state: &AppState, run_id: &str) -> Result<(), String> {
    let control = state
        .runs
        .lock()
        .map_err(|_| "Run registry is unavailable".to_string())?
        .remove(run_id)
        .ok_or_else(|| "Run is no longer active".to_string())?;
    control
        .stop
        .send(())
        .map_err(|_| "Run has already completed".to_string())
}

fn build_process(command: &ProjectCommand) -> Result<tokio::process::Child, String> {
    Command::new(&command.program)
        .args(&command.args)
        .current_dir(&command.working_directory)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|error| format!("Cannot start {}: {error}", command.display_command))
}

#[allow(clippy::too_many_arguments)]
async fn supervise_process(
    app: AppHandle,
    run_id: &str,
    project_id: String,
    command: ProjectCommand,
    profile_id: Option<String>,
    profile_action: Option<CommandKind>,
    project_path: String,
    platform: Option<Facet>,
    channel: Option<Facet>,
    git_branch: Option<String>,
    git_commit: Option<String>,
    worktree_clean: Option<bool>,
    started_at: i64,
    child: &mut tokio::process::Child,
    stdout: Option<tokio::process::ChildStdout>,
    stderr: Option<tokio::process::ChildStderr>,
    stop_rx: oneshot::Receiver<()>,
) -> Result<RunFinished, String> {
    let stdout_task = stdout.map(|stream| {
        let app = app.clone();
        let run_id = run_id.to_string();
        tauri::async_runtime::spawn(consume_stream(app, run_id, OutputStream::Stdout, stream))
    });
    let stderr_task = stderr.map(|stream| {
        let app = app.clone();
        let run_id = run_id.to_string();
        tauri::async_runtime::spawn(consume_stream(app, run_id, OutputStream::Stderr, stream))
    });

    let completed = {
        let wait_future = child.wait();
        pin_mut!(wait_future);
        pin_mut!(stop_rx);
        match select(wait_future, stop_rx).await {
            Either::Left((result, _)) => Some(result.map_err(|error| error.to_string())?),
            Either::Right((_, _)) => None,
        }
    };
    let (status, cancelled) = match completed {
        Some(status) => (status, false),
        None => {
            child.kill().await.map_err(|error| error.to_string())?;
            (child.wait().await.map_err(|error| error.to_string())?, true)
        }
    };
    let stdout_text = join_output(stdout_task).await;
    let stderr_text = join_output(stderr_task).await;
    let finished_at = now_millis();
    let run_status = if cancelled {
        RunStatus::Cancelled
    } else if status.success() {
        RunStatus::Succeeded
    } else {
        RunStatus::Failed
    };

    Ok(RunFinished {
        run_id: run_id.to_string(),
        project_id,
        command_id: command.id,
        profile_id,
        profile_action,
        project_path,
        platform,
        channel,
        git_branch,
        git_commit,
        worktree_clean,
        display_command: command.display_command,
        started_at,
        finished_at,
        duration_ms: finished_at.saturating_sub(started_at),
        status: run_status,
        exit_code: status.code(),
        stdout: stdout_text,
        stderr: stderr_text,
    })
}

async fn consume_stream<R>(
    app: AppHandle,
    run_id: String,
    stream: OutputStream,
    reader: R,
) -> String
where
    R: AsyncRead + Unpin,
{
    let mut lines = BufReader::new(reader).lines();
    let mut output = String::new();
    while let Ok(Some(line)) = lines.next_line().await {
        output.push_str(&line);
        output.push('\n');
        let _ = app.emit(
            "run-output",
            RunOutput {
                run_id: run_id.clone(),
                stream: stream.clone(),
                line,
            },
        );
    }
    output
}

async fn join_output(task: Option<tauri::async_runtime::JoinHandle<String>>) -> String {
    match task {
        Some(task) => task.await.unwrap_or_default(),
        None => String::new(),
    }
}
