use std::path::Path;

use crate::os_open;
use crate::scanner::scan_project;

#[tauri::command]
pub async fn open_project_remote_command(remote: String) -> Result<(), String> {
    let url = normalize_remote(&remote)?;
    tauri::async_runtime::spawn_blocking(move || open_external(&url))
        .await
        .map_err(|error| format!("Open remote task failed: {error}"))?
}

#[tauri::command]
pub async fn open_project_link_command(
    project_path: String,
    link_id: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
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
    .map_err(|error| format!("Open project link task failed: {error}"))?
}

fn open_external(url: &str) -> Result<(), String> {
    if !(url.starts_with("http://") || url.starts_with("https://") || url.starts_with("file://")) {
        return Err("Only http://, https://, and file:// links can be opened".to_string());
    }
    os_open::open_url(url).map_err(|error| format!("Cannot open link: {error}"))
}

fn normalize_remote(remote: &str) -> Result<String, String> {
    let value = remote.trim();
    if value.starts_with("http://") || value.starts_with("https://") || value.starts_with("file://")
    {
        return Ok(value.to_string());
    }
    if let Some(rest) = value.strip_prefix("git@") {
        if let Some((host, path)) = rest.split_once(':') {
            return Ok(format!("https://{host}/{path}")
                .trim_end_matches(".git")
                .to_string());
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
