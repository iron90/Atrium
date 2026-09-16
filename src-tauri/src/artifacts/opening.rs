use std::path::Path;
use std::process::Command;

use tauri::AppHandle;

use crate::scanner::scan_project;

use super::inspection::safe_declared_path;

pub fn open_declared_artifact(
    app: &AppHandle,
    project_path: &Path,
    profile_id: &str,
    relative_path: &str,
) -> Result<(), String> {
    let profiles = scan_project(project_path)
        .ok_or_else(|| "Project path cannot be scanned".to_string())?
        .build_profiles;
    let profile = profiles
        .iter()
        .find(|profile| profile.id == profile_id)
        .ok_or_else(|| "Build profile is not declared in the scanned project".to_string())?;
    if !profile.artifacts.iter().any(|path| path == relative_path) {
        return Err("Artifact path is not declared by this build profile".to_string());
    }

    let root = project_path
        .canonicalize()
        .map_err(|error| format!("Cannot open project: {error}"))?;
    let target = safe_declared_path(&root, relative_path)?;
    let canonical_target = target
        .canonicalize()
        .map_err(|error| format!("Artifact does not exist: {error}"))?;
    if !canonical_target.starts_with(&root) {
        return Err("Artifact path resolves outside the project".to_string());
    }
    open_path(app, &canonical_target)
}

fn open_path(_app: &AppHandle, path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let (program, argument) = ("open", path.to_string_lossy().to_string());
    #[cfg(target_os = "windows")]
    let (program, argument) = ("explorer", path.to_string_lossy().to_string());
    #[cfg(all(unix, not(target_os = "macos")))]
    let (program, argument) = ("xdg-open", path.to_string_lossy().to_string());

    Command::new(program)
        .arg(argument)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Cannot open artifact: {error}"))
}
