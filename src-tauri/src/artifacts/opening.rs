use std::path::Path;

use crate::os_open;
use crate::scanner::scan_project;

use super::inspection::safe_declared_path;

pub fn open_declared_artifact(
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
    os_open::open_path(&canonical_target).map_err(|error| format!("Cannot open artifact: {error}"))
}
