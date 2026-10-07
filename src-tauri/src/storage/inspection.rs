use std::cmp::Reverse;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::filesystem_metrics::measure_path;
use crate::manifest_projection::path_targets_protected_component;
use crate::model::{CleanupDeclaration, ProjectStorage, StorageEntry, StorageEntryKind};
use crate::project_path::resolve_existing_path_inside_project;

// Execution-time mirrors of the declaration-time protection list: Win32 path
// normalization can make a declared component resolve to a protected name.
const EXECUTION_PROTECTED_COMPONENTS: &[&str] = &[".git", ".atrium"];

pub fn inspect_project_storage(
    project_path: &Path,
    cleanup: &CleanupDeclaration,
) -> ProjectStorage {
    // Canonicalize first: a project reached through a symlink must be
    // measured at its real location instead of being skipped as a symlink.
    let root = dunce::canonicalize(project_path).unwrap_or_else(|_| project_path.to_path_buf());
    let total = measure_path(&root);
    let entries = discover_cleanable_entries(&root, cleanup);
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
        let Some(canonical_target) = resolve_safe_cleanable_directory(project_path, &target) else {
            continue;
        };
        if !seen_targets.insert(canonical_target.clone()) {
            continue;
        }

        // Each entry is measured with its own inode bookkeeping, like a
        // standalone `du` of that directory. Sharing the whole-project walk's
        // hardlink accounting would report the entry's hardlinked files as
        // already counted whenever this walk misses the directory cache.
        let count = measure_path(&canonical_target);
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

pub(super) fn resolve_safe_cleanable_directory(root: &Path, target: &Path) -> Option<PathBuf> {
    let canonical_target = resolve_existing_path_inside_project(root, target).ok()?;
    let metadata = fs::symlink_metadata(target).ok()?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return None;
    }
    let canonical_root = dunce::canonicalize(root).ok()?;
    if path_targets_protected_component(
        &canonical_root,
        &canonical_target,
        EXECUTION_PROTECTED_COMPONENTS,
    ) {
        return None;
    }
    Some(canonical_target)
}
