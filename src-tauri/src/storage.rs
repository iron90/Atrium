use std::cmp::Reverse;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::model::{
    CleanupDeclaration, CleanupResult, ProjectStorage, StorageCleanupFailure, StorageEntry,
    StorageEntryKind,
};

struct StorageCount {
    bytes: u64,
    file_count: u64,
}

pub fn inspect_project_storage(
    project_path: &Path,
    cleanup: &CleanupDeclaration,
) -> ProjectStorage {
    let total = directory_size(project_path);
    let entries = discover_cleanable_entries(project_path, cleanup);
    let cleanable_bytes = entries.iter().map(|entry| entry.bytes).sum();

    ProjectStorage {
        total_bytes: total.bytes,
        cleanable_bytes,
        entries,
    }
}

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
        if !is_safe_cleanable_directory(&root, &target) {
            failed_entries.push(StorageCleanupFailure {
                relative_path: entry.relative_path,
                message: "The path is not a safe cleanable directory".to_string(),
            });
            continue;
        }

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

fn discover_cleanable_entries(
    project_path: &Path,
    cleanup: &CleanupDeclaration,
) -> Vec<StorageEntry> {
    let mut entries = Vec::new();
    let mut seen_targets = HashSet::<PathBuf>::new();

    let declared_paths = cleanup
        .cache
        .iter()
        .map(|path| (path, StorageEntryKind::Cache))
        .chain(
            cleanup
                .build
                .iter()
                .map(|path| (path, StorageEntryKind::Build)),
        );

    for (relative_path, kind) in declared_paths {
        let target = project_path.join(relative_path);
        if !is_safe_cleanable_directory(project_path, &target) {
            continue;
        }

        let Ok(canonical_target) = target.canonicalize() else {
            continue;
        };
        if !seen_targets.insert(canonical_target) {
            continue;
        }

        let count = directory_size(&target);
        entries.push(StorageEntry {
            relative_path: relative_path.clone(),
            kind,
            bytes: count.bytes,
            file_count: count.file_count,
        });
    }

    entries.sort_by_key(|entry| Reverse(entry.bytes));
    entries
}

fn is_safe_cleanable_directory(root: &Path, target: &Path) -> bool {
    if !target.starts_with(root) {
        return false;
    }

    let Ok(metadata) = fs::symlink_metadata(target) else {
        return false;
    };
    metadata.is_dir() && !metadata.file_type().is_symlink()
}

fn directory_size(path: &Path) -> StorageCount {
    let Ok(metadata) = fs::symlink_metadata(path) else {
        return StorageCount {
            bytes: 0,
            file_count: 0,
        };
    };

    if metadata.file_type().is_symlink() {
        return StorageCount {
            bytes: 0,
            file_count: 0,
        };
    }
    if metadata.is_file() {
        return StorageCount {
            bytes: metadata.len(),
            file_count: 1,
        };
    }
    if !metadata.is_dir() {
        return StorageCount {
            bytes: 0,
            file_count: 0,
        };
    }

    let mut total = StorageCount {
        bytes: 0,
        file_count: 0,
    };
    let Ok(entries) = fs::read_dir(path) else {
        return total;
    };

    for entry in entries.flatten() {
        let child = directory_size(&entry.path());
        total.bytes += child.bytes;
        total.file_count += child.file_count;
    }
    total
}

#[cfg(test)]
mod tests {
    use super::{
        clean_project_artifacts, clean_project_artifacts_selected, inspect_project_storage,
    };
    use crate::model::CleanupDeclaration;
    use std::fs;

    fn fixture_root(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("atrium-storage-{name}-{}", std::process::id()))
    }

    #[test]
    fn measures_project_and_known_cleanable_directories() {
        let root = fixture_root("measure");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("dist/assets")).expect("create dist fixture");
        fs::create_dir_all(root.join("node_modules/.cache")).expect("create cache fixture");
        fs::create_dir_all(root.join("src")).expect("create source fixture");
        fs::write(root.join("dist/assets/app.js"), b"12345").expect("write build fixture");
        fs::write(root.join("node_modules/.cache/data"), b"123").expect("write cache fixture");
        fs::write(root.join("src/main.ts"), b"source").expect("write source fixture");

        let cleanup = CleanupDeclaration {
            cache: vec!["node_modules/.cache".to_string()],
            build: vec!["dist".to_string()],
        };
        let storage = inspect_project_storage(&root, &cleanup);
        assert_eq!(storage.total_bytes, 14);
        assert_eq!(storage.cleanable_bytes, 8);
        assert_eq!(storage.entries.len(), 2);

        fs::remove_dir_all(root).expect("remove storage fixture");
    }

    #[test]
    fn cleanup_only_removes_allowlisted_directories() {
        let root = fixture_root("cleanup");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("build")).expect("create build fixture");
        fs::create_dir_all(root.join("source")).expect("create source fixture");
        fs::write(root.join("build/output"), b"artifact").expect("write build fixture");
        fs::write(root.join("source/main"), b"source").expect("write source fixture");

        let cleanup = CleanupDeclaration {
            cache: Vec::new(),
            build: vec!["build".to_string()],
        };
        let result = clean_project_artifacts(&root, &cleanup).expect("clean project fixture");
        assert_eq!(result.removed_entries.len(), 1);
        assert!(result.failed_entries.is_empty());
        assert!(!root.join("build").exists());
        assert!(root.join("source/main").exists());

        fs::remove_dir_all(root).expect("remove storage fixture");
    }

    #[test]
    fn cleanup_selection_cannot_expand_manifest_scope() {
        let root = fixture_root("selection");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("cache")).expect("create cache fixture");
        fs::create_dir_all(root.join("source")).expect("create source fixture");
        fs::write(root.join("cache/item"), b"cache").expect("write cache fixture");
        fs::write(root.join("source/item"), b"source").expect("write source fixture");

        let cleanup = CleanupDeclaration {
            cache: vec!["cache".to_string()],
            build: Vec::new(),
        };
        let selected = vec!["source".to_string()];
        let result = clean_project_artifacts_selected(&root, &cleanup, Some(&selected))
            .expect("clean selected fixture");
        assert!(result.removed_entries.is_empty());
        assert!(root.join("cache/item").exists());
        assert!(root.join("source/item").exists());

        fs::remove_dir_all(root).expect("remove storage fixture");
    }
}
