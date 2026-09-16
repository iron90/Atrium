use std::process::Stdio;

use tauri::{AppHandle, Emitter};
use tokio::process::Command;
use tokio::sync::oneshot;

use crate::history::{append_run_history, with_history_lock};
use crate::model::{CommandKind, ProjectCommand, RunError, RunStarted};
use crate::run_context::RunContext;
use crate::run_supervisor::supervise_process;
use crate::run_validation::{resolve_run_request, validate_run_id};
use crate::state::{AppState, RunControl};

pub async fn start_project_command(
    app: AppHandle,
    state: AppState,
    project_path: String,
    command_id: String,
    profile_id: Option<String>,
    profile_action: Option<CommandKind>,
) -> Result<RunStarted, String> {
    let request = resolve_run_request(&project_path, &command_id, profile_id, profile_action)?;
    let context = RunContext::new(&request);
    let mut child = build_process(&request.command)?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let (stop_tx, stop_rx) = oneshot::channel();
    state
        .runs
        .lock()
        .map_err(|_| "Run registry is unavailable".to_string())?
        .insert(context.run_id().to_string(), RunControl { stop: stop_tx });

    let started = context.started();
    if let Err(error) = app.emit("run-started", &started) {
        if let Ok(mut runs) = state.runs.lock() {
            runs.remove(context.run_id());
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
        let history_lock = state_for_task.history_lock.clone();
        let history_app = app_for_task.clone();
        let history_record = finished.clone();
        let history_result = tauri::async_runtime::spawn_blocking(move || {
            with_history_lock(&history_lock, || {
                append_run_history(&history_app, &history_record)
            })
        })
        .await;
        match history_result {
            Ok(Ok(())) => {}
            Ok(Err(error)) => report_run_error(
                &app_for_task,
                &finished.run_id,
                format!("Run completed but could not be persisted: {error}"),
            ),
            Err(error) => report_run_error(
                &app_for_task,
                &finished.run_id,
                format!("Run completed but history task failed: {error}"),
            ),
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

pub fn stop_project_run(state: &AppState, run_id: &str) -> Result<(), String> {
    validate_run_id(run_id)?;
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
