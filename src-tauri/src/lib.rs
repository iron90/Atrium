mod artifacts;
mod command_discovery;
mod commands;
mod conformance;
mod git;
mod guidance;
mod history;
mod manifest;
mod manifest_schema;
mod model;
mod project_scan;
mod protocol;
mod runner;
mod scanner;
mod state;
mod storage;
mod time;
mod workspace_scan;

pub fn run() {
    tauri::Builder::default()
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::default_workspace_path_command,
            commands::scan_workspace_command,
            commands::inspect_project_command,
            commands::generate_icon_conformance_report_command,
            commands::generate_project_configuration_report_command,
            commands::generate_project_guidance_command,
            commands::clean_project_artifacts_command,
            commands::run_project_command,
            commands::stop_project_command,
            commands::list_run_history_command,
            commands::open_run_log_command,
            commands::open_declared_artifact_command,
            commands::read_git_change_summary_command,
            commands::open_project_directory_command,
            commands::open_project_terminal_command,
            commands::open_project_remote_command,
            commands::open_project_link_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running Atrium");
}
