use std::collections::HashSet;
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
        if let Some(directory) = resolve_workspace_entry(&root, &entry_path, &mut warnings) {
            entries.push(directory);
        }
    }
    entries.sort_by_key(|entry| entry.file_name().map(ToOwned::to_owned));

    let mut projects = Vec::new();
    let mut seen_projects = HashSet::new();
    for entry in entries {
        let path = entry;
        match is_project_candidate(&path) {
            Ok(true) => {}
            Ok(false) => continue,
            Err(error) => {
                warnings.push(format!(
                    "Skipped unreadable project candidate {}: {error}",
                    path.display()
                ));
                continue;
            }
        }
        match scan_project(&path) {
            Some(project) if seen_projects.insert(project.id.clone()) => projects.push(project),
            Some(_) => {}
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

fn resolve_workspace_entry(
    root: &Path,
    path: &Path,
    warnings: &mut Vec<String>,
) -> Option<std::path::PathBuf> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) => {
            warnings.push(format!(
                "Skipped unreadable workspace entry {}: {error}",
                path.display()
            ));
            return None;
        }
    };

    if metadata.file_type().is_symlink() {
        let resolved = match path.canonicalize() {
            Ok(resolved) => resolved,
            Err(error) => {
                warnings.push(format!(
                    "Skipped unreadable workspace symlink {}: {error}",
                    path.display()
                ));
                return None;
            }
        };
        if !resolved.starts_with(root) {
            warnings.push(format!(
                "Skipped workspace symlink outside workspace: {}",
                path.display()
            ));
            return None;
        }
        return match fs::metadata(&resolved) {
            Ok(metadata) if metadata.is_dir() => Some(resolved),
            Ok(_) => None,
            Err(error) => {
                warnings.push(format!(
                    "Skipped unreadable workspace entry {}: {error}",
                    path.display()
                ));
                None
            }
        };
    }

    metadata.is_dir().then(|| path.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::{resolve_workspace_entry, scan_workspace_with_exclusions};
    use std::path::Path;

    #[test]
    fn reports_entries_that_cannot_be_stat() {
        let path = std::env::temp_dir().join(format!(
            "atrium-workspace-entry-that-does-not-exist-{}",
            std::process::id()
        ));
        let mut warnings = Vec::new();

        let root = std::env::temp_dir();
        assert!(resolve_workspace_entry(&root, &path, &mut warnings).is_none());
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].starts_with("Skipped unreadable workspace entry "));
        assert!(warnings[0].contains(Path::new(&path).to_string_lossy().as_ref()));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_workspace_symlinks_that_leave_the_root() {
        use std::fs;
        use std::os::unix::fs::symlink;

        let root = std::env::temp_dir().join(format!(
            "atrium-workspace-symlink-root-{}",
            std::process::id()
        ));
        let outside = std::env::temp_dir().join(format!(
            "atrium-workspace-symlink-outside-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
        fs::create_dir_all(&root).expect("create workspace root");
        fs::create_dir_all(&outside).expect("create outside directory");
        symlink(&outside, root.join("linked")).expect("create workspace symlink");

        let mut warnings = Vec::new();
        assert!(resolve_workspace_entry(&root, &root.join("linked"), &mut warnings).is_none());
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("outside workspace"));

        fs::remove_dir_all(root).expect("remove workspace root");
        fs::remove_dir_all(outside).expect("remove outside directory");
    }

    #[cfg(unix)]
    #[test]
    fn deduplicates_projects_reached_by_an_internal_symlink() {
        use std::fs;
        use std::os::unix::fs::symlink;

        let root = std::env::temp_dir().join(format!(
            "atrium-workspace-internal-symlink-{}",
            std::process::id()
        ));
        let project = root.join("project");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&project).expect("create project directory");
        fs::write(project.join("package.json"), "{}").expect("write project marker");
        symlink(&project, root.join("project-link")).expect("create internal symlink");

        let snapshot = scan_workspace_with_exclusions(&root, &[]).expect("scan workspace");
        assert_eq!(snapshot.projects.len(), 1);
        assert_eq!(
            snapshot.projects[0].path,
            project
                .canonicalize()
                .expect("canonical project")
                .to_string_lossy()
        );

        fs::remove_dir_all(root).expect("remove workspace root");
    }
}
