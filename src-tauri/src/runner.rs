use std::process::{ExitStatus, Stdio};

use futures_util::future::{select, Either};
use futures_util::pin_mut;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::process::Command;
use tokio::sync::oneshot;
use uuid::Uuid;

use crate::history::append_run_history;
use crate::model::{
    CommandKind, Facet, OutputStream, ProjectCommand, ProjectConfigurationStatus, RunError,
    RunFinished, RunOutput, RunStarted, RunStatus,
};
use crate::scanner::scan_project;
use crate::state::{AppState, RunControl};
use crate::time::now_millis;

struct RunContext {
    run_id: String,
    project_id: String,
    command_id: String,
    profile_id: Option<String>,
    profile_action: Option<CommandKind>,
    project_path: String,
    platform: Option<Facet>,
    channel: Option<Facet>,
    git_branch: Option<String>,
    git_commit: Option<String>,
    worktree_clean: Option<bool>,
    display_command: String,
    started_at: i64,
}

impl RunContext {
    fn started(&self) -> RunStarted {
        RunStarted {
            run_id: self.run_id.clone(),
            project_id: self.project_id.clone(),
            command_id: self.command_id.clone(),
            profile_id: self.profile_id.clone(),
            display_command: self.display_command.clone(),
            started_at: self.started_at,
            status: RunStatus::Running,
        }
    }

    fn finished(
        &self,
        status: RunStatus,
        exit_code: Option<i32>,
        stdout: String,
        stderr: String,
    ) -> RunFinished {
        let finished_at = now_millis();
        RunFinished {
            run_id: self.run_id.clone(),
            project_id: self.project_id.clone(),
            command_id: self.command_id.clone(),
            profile_id: self.profile_id.clone(),
            profile_action: self.profile_action.clone(),
            project_path: self.project_path.clone(),
            platform: self.platform.clone(),
            channel: self.channel.clone(),
            git_branch: self.git_branch.clone(),
            git_commit: self.git_commit.clone(),
            worktree_clean: self.worktree_clean,
            display_command: self.display_command.clone(),
            started_at: self.started_at,
            finished_at,
            duration_ms: finished_at.saturating_sub(self.started_at),
            status,
            exit_code,
            stdout,
            stderr,
        }
    }
}

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
    let context = RunContext {
        run_id: Uuid::new_v4().to_string(),
        project_id: project.id.clone(),
        command_id: command.id.clone(),
        profile_id: profile_id.clone(),
        profile_action: profile_action.clone(),
        project_path: project.path.clone(),
        platform: profile_platform,
        channel: profile_channel,
        git_branch: project.repo.as_ref().and_then(|repo| repo.branch.clone()),
        git_commit: project
            .repo
            .as_ref()
            .and_then(|repo| repo.last_commit.as_ref())
            .map(|commit| commit.sha.clone()),
        worktree_clean: project.repo.as_ref().map(|repo| repo.is_clean),
        display_command: command.display_command.clone(),
        started_at: now_millis(),
    };
    let mut child = build_process(&command)?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let (stop_tx, stop_rx) = oneshot::channel();
    state
        .runs
        .lock()
        .map_err(|_| "Run registry is unavailable".to_string())?
        .insert(context.run_id.clone(), RunControl { stop: stop_tx });

    let started = context.started();
    if let Err(error) = app.emit("run-started", &started) {
        if let Ok(mut runs) = state.runs.lock() {
            runs.remove(&context.run_id);
        }
        let _ = child.kill().await;
        return Err(format!("Cannot emit run-started: {error}"));
    }

    let app_for_task = app.clone();
    let state_for_task = state.clone();
    tauri::async_runtime::spawn(async move {
        let finished = supervise_process(
            app_for_task.clone(),
            context,
            &mut child,
            stdout,
            stderr,
            stop_rx,
        )
        .await;
        if let Ok(mut runs) = state_for_task.runs.lock() {
            runs.remove(&finished.run_id);
        } else {
            report_run_error(
                &app_for_task,
                &finished.run_id,
                "Run registry could not be cleaned up".to_string(),
            );
        }
        if let Err(error) = append_run_history(&app_for_task, &finished) {
            report_run_error(
                &app_for_task,
                &finished.run_id,
                format!("Run completed but could not be persisted: {error}"),
            );
        }
        if let Err(error) = app_for_task.emit("run-finished", &finished) {
            eprintln!(
                "Atrium could not emit run-finished for {}: {error}",
                finished.run_id
            );
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

struct StreamOutput {
    text: String,
    error: Option<String>,
}

async fn supervise_process(
    app: AppHandle,
    context: RunContext,
    child: &mut tokio::process::Child,
    stdout: Option<tokio::process::ChildStdout>,
    stderr: Option<tokio::process::ChildStderr>,
    stop_rx: oneshot::Receiver<()>,
) -> RunFinished {
    let stdout_task = stdout.map(|stream| {
        let app = app.clone();
        let run_id = context.run_id.clone();
        tauri::async_runtime::spawn(consume_stream(app, run_id, OutputStream::Stdout, stream))
    });
    let stderr_task = stderr.map(|stream| {
        let app = app.clone();
        let run_id = context.run_id.clone();
        tauri::async_runtime::spawn(consume_stream(app, run_id, OutputStream::Stderr, stream))
    });

    let mut supervision_error = None;
    let (wait_result, cancellation_requested) = {
        let wait_future = child.wait();
        pin_mut!(wait_future);
        pin_mut!(stop_rx);
        match select(wait_future, stop_rx).await {
            Either::Left((result, _)) => (Some(result), false),
            Either::Right((_, _)) => (None, true),
        }
    };
    let (status, cancelled) = if cancellation_requested {
        let status = match child.kill().await {
            Ok(()) => match child.wait().await {
                Ok(status) => Some(status),
                Err(error) => {
                    record_error(
                        &mut supervision_error,
                        format!("Process wait after cancellation failed: {error}"),
                    );
                    None
                }
            },
            Err(kill_error) => match child.try_wait() {
                Ok(Some(status)) => Some(status),
                Ok(None) => {
                    record_error(
                        &mut supervision_error,
                        format!("Process cancellation failed: {kill_error}"),
                    );
                    None
                }
                Err(wait_error) => {
                    record_error(
                        &mut supervision_error,
                        format!(
                            "Process cancellation failed: {kill_error}; follow-up wait failed: {wait_error}"
                        ),
                    );
                    None
                }
            },
        };
        (status, true)
    } else {
        match wait_result.expect("a process wait result is present") {
            Ok(status) => (Some(status), false),
            Err(error) => {
                record_error(
                    &mut supervision_error,
                    format!("Process wait failed: {error}"),
                );
                (None, false)
            }
        }
    };

    let stdout_text = collect_output(stdout_task, &mut supervision_error).await;
    let stderr_text = collect_output(stderr_task, &mut supervision_error).await;
    let stderr_text = match supervision_error.as_ref() {
        Some(error) => {
            if stderr_text.is_empty() {
                format!("Atrium supervisor error: {error}\n")
            } else {
                format!("{stderr_text}\nAtrium supervisor error: {error}\n")
            }
        }
        None => stderr_text,
    };
    let run_status = if cancelled {
        RunStatus::Cancelled
    } else if supervision_error.is_some() {
        RunStatus::Failed
    } else if status.as_ref().is_some_and(ExitStatus::success) {
        RunStatus::Succeeded
    } else {
        RunStatus::Failed
    };

    context.finished(
        run_status,
        status.and_then(|status| status.code()),
        stdout_text,
        stderr_text,
    )
}

async fn consume_stream<R>(
    app: AppHandle,
    run_id: String,
    stream: OutputStream,
    reader: R,
) -> StreamOutput
where
    R: AsyncRead + Unpin,
{
    let stream_name = match stream {
        OutputStream::Stdout => "stdout",
        OutputStream::Stderr => "stderr",
    };
    let mut lines = BufReader::new(reader).lines();
    let mut output = String::new();
    let mut stream_error = None;
    loop {
        match lines.next_line().await {
            Ok(Some(line)) => {
                output.push_str(&line);
                output.push('\n');
                if let Err(error) = app.emit(
                    "run-output",
                    RunOutput {
                        run_id: run_id.clone(),
                        stream: stream.clone(),
                        line,
                    },
                ) {
                    if stream_error.is_none() {
                        stream_error = Some(format!("Cannot emit {stream_name} output: {error}"));
                    }
                }
            }
            Ok(None) => break,
            Err(error) => {
                stream_error = Some(format!("Cannot read {stream_name} output: {error}"));
                break;
            }
        }
    }
    StreamOutput {
        text: output,
        error: stream_error,
    }
}

async fn collect_output(
    task: Option<tauri::async_runtime::JoinHandle<StreamOutput>>,
    supervision_error: &mut Option<String>,
) -> String {
    match task {
        Some(task) => match task.await {
            Ok(output) => {
                if let Some(error) = output.error {
                    record_error(supervision_error, error);
                }
                output.text
            }
            Err(error) => {
                record_error(
                    supervision_error,
                    format!("Output reader task failed: {error}"),
                );
                String::new()
            }
        },
        None => String::new(),
    }
}

fn record_error(target: &mut Option<String>, message: String) {
    if let Some(existing) = target {
        existing.push_str("; ");
        existing.push_str(&message);
    } else {
        *target = Some(message);
    }
}

fn report_run_error(app: &AppHandle, run_id: &str, message: String) {
    let error = RunError {
        run_id: run_id.to_string(),
        message,
    };
    if let Err(emit_error) = app.emit("run-error", &error) {
        eprintln!(
            "Atrium could not report run error for {run_id}: {emit_error}; {}",
            error.message
        );
    }
}
