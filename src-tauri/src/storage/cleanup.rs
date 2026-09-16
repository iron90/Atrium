use std::fs;
use std::path::Path;

use crate::model::{CleanupDeclaration, CleanupResult, StorageCleanupFailure};

use super::inspection::{
    discover_cleanable_entries, inspect_project_storage, resolve_safe_cleanable_directory,
};

#[allow(dead_code)]
pub fn clean_project_artifacts(
    project_path: &Path,
    cleanup: &CleanupDeclaration,
) -> Result<CleanupResult, String> {
    clean_project_artifacts_selected(project_path, cleanup, None)
}

pub fn clean_project_artifacts_selected(
    project_path: &Path,
    cleanup: &CleanupDeclaration,
    selected_paths: Option<&[String]>,
) -> Result<CleanupResult, String> {
    let root = project_path
        .canonicalize()
        .map_err(|error| format!("Cannot open project for cleanup: {error}"))?;
    if !root.is_dir() {
        return Err("Project path is not a directory".to_string());
    }

    let candidates = discover_cleanable_entries(&root, cleanup)
        .into_iter()
        .filter(|entry| {
            selected_paths
                .map(|paths| paths.iter().any(|path| path == &entry.relative_path))
                .unwrap_or(true)
        })
        .collect::<Vec<_>>();
    let mut removed_bytes = 0;
    let mut removed_entries = Vec::new();
    let mut failed_entries = Vec::new();

    for entry in candidates {
        let target = root.join(&entry.relative_path);
        let Some(target) = resolve_safe_cleanable_directory(&root, &target) else {
            failed_entries.push(StorageCleanupFailure {
                relative_path: entry.relative_path,
                message: "The path is not a safe cleanable directory".to_string(),
            });
            continue;
        };

        match fs::remove_dir_all(&target) {
            Ok(()) => {
                removed_bytes += entry.bytes;
                removed_entries.push(entry);
            }
            Err(error) => failed_entries.push(StorageCleanupFailure {
                relative_path: entry.relative_path,
                message: error.to_string(),
            }),
        }
    }

    Ok(CleanupResult {
        removed_bytes,
        removed_entries,
        failed_entries,
        storage: inspect_project_storage(&root, cleanup),
    })
}
