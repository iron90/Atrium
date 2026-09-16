use std::process::Stdio;

use tauri::{AppHandle, Emitter};
use tokio::process::Command;
use tokio::sync::oneshot;
use uuid::Uuid;

use crate::history::append_run_history;
use crate::model::{
    CommandKind, Facet, ProjectCommand, ProjectConfigurationStatus, RunError, RunFinished,
    RunStarted, RunStatus,
};
use crate::run_supervisor::supervise_process;
use crate::scanner::scan_project;
use crate::state::{AppState, RunControl};
use crate::time::now_millis;

pub(crate) struct RunContext {
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
    pub(crate) fn run_id(&self) -> &str {
        &self.run_id
    }

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

    pub(crate) fn finished(
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
