mod artifacts;
mod captured_process;
mod command_boundary;
mod command_discovery;
mod conformance;
mod filesystem_metrics;
mod git;
mod git_commands;
mod guidance;
mod history;
mod install_policy;
mod manifest;
mod manifest_projection;
mod manifest_schema;
mod model;
mod network_proxy;
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
mod web_service;
mod workspace_commands;
mod workspace_membership;
mod workspace_policy;
mod workspace_scan;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(state::AppState::default())
        .setup(|app| {
            // Loaded before the first window appears so a command started in
            // the first moments of the session already sees the proxy.
            network_proxy::load(app.handle());
            Ok(())
        })
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
            git_commands::read_git_branch_overview_command,
            tool_commands::project::open_project_directory_command,
            tool_commands::project::open_project_terminal_command,
            tool_commands::external::open_project_remote_command,
            tool_commands::external::open_web_profile_command,
            tool_commands::external::open_release_page_command,
            network_proxy::read_network_proxy_command,
            network_proxy::detect_local_proxies_command,
            network_proxy::test_network_proxy_command,
            network_proxy::save_network_proxy_command
        ])
        .build(tauri::generate_context!())
        .expect("error while building Atrium")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                app_handle.state::<state::AppState>().kill_all_runs();
            }
        });
}
