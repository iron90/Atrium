use std::cmp::Reverse;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::filesystem_metrics::measure_path;
use crate::model::{CleanupDeclaration, ProjectStorage, StorageEntry, StorageEntryKind};

pub fn inspect_project_storage(
    project_path: &Path,
    cleanup: &CleanupDeclaration,
) -> ProjectStorage {
    let total = measure_path(project_path);
    let entries = discover_cleanable_entries(project_path, cleanup);
    let cleanable_bytes = entries.iter().map(|entry| entry.bytes).sum();

    ProjectStorage {
        total_bytes: total.bytes,
        cleanable_bytes,
        is_complete: total.is_complete,
        entries,
    }
}

pub(super) fn discover_cleanable_entries(
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

        let count = measure_path(&target);
        entries.push(StorageEntry {
            relative_path: relative_path.clone(),
            kind,
            bytes: count.bytes,
            file_count: count.file_count,
            is_complete: count.is_complete,
        });
    }

    entries.sort_by_key(|entry| Reverse(entry.bytes));
    entries
}

pub(super) fn is_safe_cleanable_directory(root: &Path, target: &Path) -> bool {
    if !target.starts_with(root) {
        return false;
    }

    let Ok(metadata) = fs::symlink_metadata(target) else {
        return false;
    };
    metadata.is_dir() && !metadata.file_type().is_symlink()
}
