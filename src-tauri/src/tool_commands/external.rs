use std::path::Path;

use tauri::State;

use crate::command_boundary::run_blocking;
use crate::os_open;
use crate::scanner::scan_project;
use crate::state::AppState;
use crate::url_policy::validate_browsable_url;

#[tauri::command]
pub async fn open_project_remote_command(remote: String) -> Result<(), String> {
    let url = normalize_remote(&remote)?;
    run_blocking("Open remote", move || open_external(&url)).await
}

#[tauri::command]
pub async fn open_project_link_command(
    state: State<'_, AppState>,
    project_path: String,
    link_id: String,
) -> Result<(), String> {
    state
        .inner()
        .ensure_project_in_workspace(Path::new(&project_path))?;
    run_blocking("Open project link", move || {
        let project = scan_project(Path::new(&project_path))
            .ok_or_else(|| "Project path cannot be scanned".to_string())?;
        let link = project
            .links
            .iter()
            .find(|link| link.id == link_id)
            .ok_or_else(|| "Project link is not declared in the manifest".to_string())?;
        open_external(&link.url)
    })
    .await
}

fn open_external(url: &str) -> Result<(), String> {
    validate_browsable_url(url).map_err(|error| format!("Cannot open link: {error}"))?;
    os_open::open_url(url).map_err(|error| format!("Cannot open link: {error}"))
}

fn normalize_remote(remote: &str) -> Result<String, String> {
    let value = remote.trim();
    if value.contains("://") {
        validate_browsable_url(value)
            .map_err(|error| format!("The Git remote is not a supported browsable URL: {error}"))?;
        return Ok(value.to_string());
    }
    if let Some(rest) = value.strip_prefix("git@") {
        if let Some((host, path)) = rest.split_once(':') {
            let normalized = format!("https://{host}/{path}")
                .trim_end_matches(".git")
                .to_string();
            validate_browsable_url(&normalized).map_err(|error| {
                format!("The Git remote is not a supported browsable URL: {error}")
            })?;
            return Ok(normalized);
        }
    }
    Err("The Git remote is not a supported browsable URL".to_string())
}

#[cfg(test)]
mod tests {
    use super::normalize_remote;

    #[test]
    fn normalizes_git_ssh_remotes_for_browsing() {
        assert_eq!(
            normalize_remote("git@github.com:owner/project.git").expect("remote URL"),
            "https://github.com/owner/project"
        );
    }

    #[test]
    fn rejects_non_browsable_remotes() {
        assert!(normalize_remote("owner/project").is_err());
    }
}
