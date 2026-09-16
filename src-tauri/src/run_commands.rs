use tauri::{AppHandle, State};

use crate::command_boundary::run_blocking;
use crate::history::{load_run_history, open_run_log, with_history_lock};
use crate::model::{CommandKind, RunFinished, RunStarted};
use crate::runner::{start_project_command, stop_project_run};
use crate::state::AppState;

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
    state: State<'_, AppState>,
) -> Result<Vec<RunFinished>, String> {
    let history_lock = state.inner().history_lock.clone();
    run_blocking("Run history", move || {
        with_history_lock(&history_lock, || load_run_history(&app))
    })
    .await
}

#[tauri::command]
pub async fn open_run_log_command(
    app: AppHandle,
    state: State<'_, AppState>,
    run_id: String,
) -> Result<(), String> {
    let history_lock = state.inner().history_lock.clone();
    run_blocking("Open run log", move || {
        with_history_lock(&history_lock, || open_run_log(&app, &run_id))
    })
    .await
}
