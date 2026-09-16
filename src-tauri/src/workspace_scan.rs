use std::fs;
use std::path::Path;

use crate::model::WorkspaceSnapshot;
use crate::project_scan::scan_project;
use crate::time::now_millis;
use crate::workspace_policy::{is_ignored_name, is_project_candidate};

#[allow(dead_code)]
pub fn scan_workspace(root_path: &Path) -> Result<WorkspaceSnapshot, String> {
    scan_workspace_with_exclusions(root_path, &[])
}

pub fn scan_workspace_with_exclusions(
    root_path: &Path,
    excluded_names: &[String],
) -> Result<WorkspaceSnapshot, String> {
    let root = root_path
        .canonicalize()
        .map_err(|error| format!("Cannot open workspace: {error}"))?;
    if !root.is_dir() {
        return Err("Workspace path is not a directory".to_string());
    }

    let mut entries = fs::read_dir(&root)
        .map_err(|error| format!("Cannot read workspace: {error}"))?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .filter(|entry| !is_ignored_name(&entry.file_name().to_string_lossy(), excluded_names))
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name());

    let mut projects = Vec::new();
    let mut warnings = Vec::new();
    for entry in entries {
        let path = entry.path();
        if !is_project_candidate(&path) {
            continue;
        }
        match scan_project(&path) {
            Some(project) => projects.push(project),
            None => warnings.push(format!("Skipped unreadable project: {}", path.display())),
        }
    }

    Ok(WorkspaceSnapshot {
        root_path: root.to_string_lossy().to_string(),
        scanned_at: now_millis(),
        projects,
        warnings,
    })
}
