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

    let mut warnings = Vec::new();
    let mut entries = Vec::new();
    for result in fs::read_dir(&root).map_err(|error| format!("Cannot read workspace: {error}"))? {
        let entry = match result {
            Ok(entry) => entry,
            Err(error) => {
                warnings.push(format!("Skipped unreadable workspace entry: {error}"));
                continue;
            }
        };
        let entry_name = entry.file_name();
        if is_ignored_name(&entry_name.to_string_lossy(), excluded_names) {
            continue;
        }
        let entry_path = entry.path();
        if is_directory_or_warn(&entry_path, &mut warnings) {
            entries.push(entry);
        }
    }
    entries.sort_by_key(|entry| entry.file_name());

    let mut projects = Vec::new();
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

fn is_directory_or_warn(path: &Path, warnings: &mut Vec<String>) -> bool {
    match fs::metadata(path) {
        Ok(metadata) => metadata.is_dir(),
        Err(error) => {
            warnings.push(format!(
                "Skipped unreadable workspace entry {}: {error}",
                path.display()
            ));
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::is_directory_or_warn;
    use std::path::Path;

    #[test]
    fn reports_entries_that_cannot_be_stat() {
        let path = std::env::temp_dir().join(format!(
            "atrium-workspace-entry-that-does-not-exist-{}",
            std::process::id()
        ));
        let mut warnings = Vec::new();

        assert!(!is_directory_or_warn(&path, &mut warnings));
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].starts_with("Skipped unreadable workspace entry "));
        assert!(warnings[0].contains(Path::new(&path).to_string_lossy().as_ref()));
    }
}
