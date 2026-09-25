mod artifacts;
mod command_boundary;
mod command_discovery;
mod conformance;
mod filesystem_metrics;
mod git;
mod git_commands;
mod guidance;
mod history;
mod manifest;
mod manifest_projection;
mod manifest_schema;
mod model;
mod os_open;
mod process_tree;
mod project_metadata;
mod project_path;
mod project_scan;
mod protocol;
mod run_commands;
mod run_context;
mod run_supervisor;
mod run_validation;
mod runner;
mod scan_cache;
mod scanner;
mod state;
mod storage;
mod time;
mod tool_commands;
mod url_policy;
mod workspace_commands;
mod workspace_membership;
mod workspace_policy;
mod workspace_scan;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            workspace_commands::scan_workspace_command,
            workspace_commands::sync_workspace_roots_command,
            workspace_commands::inspect_project_command,
            workspace_commands::generate_project_guidance_command,
            workspace_commands::clean_project_artifacts_command,
            run_commands::run_project_command,
            run_commands::stop_project_command,
            run_commands::list_run_history_command,
            run_commands::open_run_log_command,
            tool_commands::artifact::open_declared_artifact_command,
            git_commands::read_git_change_summary_command,
            tool_commands::project::open_project_directory_command,
            tool_commands::project::open_project_terminal_command,
            tool_commands::external::open_project_remote_command,
            tool_commands::external::open_project_link_command
        ])
        .build(tauri::generate_context!())
        .expect("error while building Atrium")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                app_handle.state::<state::AppState>().kill_all_runs();
            }
        });
}
