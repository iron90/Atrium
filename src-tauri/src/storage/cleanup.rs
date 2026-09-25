use std::fs;
use std::path::Path;
use std::time::{Duration, Instant};

use crate::filesystem_metrics::PathMetricsCache;
use crate::model::{
    CleanupDeclaration, CleanupProgress, CleanupProgressPhase, CleanupResult, StorageCleanupFailure,
};

use super::inspection::{
    discover_cleanable_entries, inspect_project_storage, resolve_safe_cleanable_directory,
};

pub fn clean_project_artifacts_selected_with_progress<F>(
    project_path: &Path,
    cleanup: &CleanupDeclaration,
    selected_paths: Option<&[String]>,
    mut on_progress: F,
) -> Result<CleanupResult, String>
where
    F: FnMut(CleanupProgress),
{
    let root = project_path
        .canonicalize()
        .map_err(|error| format!("Cannot open project for cleanup: {error}"))?;
    if !root.is_dir() {
        return Err("Project path is not a directory".to_string());
    }

    let mut metrics = PathMetricsCache::default();
    let candidates = discover_cleanable_entries(&root, cleanup, &mut metrics)
        .into_iter()
        .filter(|entry| {
            selected_paths
                .map(|paths| paths.iter().any(|path| path == &entry.relative_path))
                .unwrap_or(true)
        })
        .collect::<Vec<_>>();
    let total_bytes = candidates.iter().map(|entry| entry.bytes).sum();
    let total_files = candidates.iter().map(|entry| entry.file_count).sum();
    let mut progress = CleanupProgressReporter::new(&mut on_progress, total_bytes, total_files);
    progress.emit(CleanupProgressPhase::Preparing, None, true);
    let mut removed_bytes = 0;
    let mut removed_entries = Vec::new();
    let mut failed_entries = Vec::new();

    for entry in candidates {
        let target = root.join(&entry.relative_path);
        progress.begin_entry(entry.relative_path.clone());
        let Some(target) = resolve_safe_cleanable_directory(&root, &target) else {
            failed_entries.push(StorageCleanupFailure {
                relative_path: entry.relative_path,
                message: "The path is not a safe cleanable directory".to_string(),
            });
            continue;
        };

        match remove_directory_with_progress(&target, &entry.relative_path, &mut progress) {
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

    progress.emit(CleanupProgressPhase::Finalizing, None, true);
    Ok(CleanupResult {
        removed_bytes,
        removed_entries,
        failed_entries,
        storage: inspect_project_storage(&root, cleanup),
    })
}

const PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(100);
const PROGRESS_FILE_INTERVAL: u64 = 256;
const PROGRESS_BYTE_INTERVAL: u64 = 16 * 1024 * 1024;

struct CleanupProgressReporter<'a, F>
where
    F: FnMut(CleanupProgress),
{
    on_progress: &'a mut F,
    total_bytes: u64,
    total_files: u64,
    completed_bytes: u64,
    completed_files: u64,
    current_path: Option<String>,
    last_emitted_bytes: u64,
    last_emitted_files: u64,
    last_emitted_at: Instant,
}

impl<'a, F> CleanupProgressReporter<'a, F>
where
    F: FnMut(CleanupProgress),
{
    fn new(on_progress: &'a mut F, total_bytes: u64, total_files: u64) -> Self {
        Self {
            on_progress,
            total_bytes,
            total_files,
            completed_bytes: 0,
            completed_files: 0,
            current_path: None,
            last_emitted_bytes: 0,
            last_emitted_files: 0,
            last_emitted_at: Instant::now(),
        }
    }

    fn begin_entry(&mut self, relative_path: String) {
        self.current_path = Some(relative_path.clone());
        self.emit(CleanupProgressPhase::Deleting, Some(relative_path), true);
    }

    fn advance(&mut self, bytes: u64, files: u64, relative_path: String) {
        self.completed_bytes = self.completed_bytes.saturating_add(bytes);
        self.completed_files = self.completed_files.saturating_add(files);
        self.current_path = Some(relative_path.clone());
        self.emit(CleanupProgressPhase::Deleting, Some(relative_path), false);
    }

    fn emit(&mut self, phase: CleanupProgressPhase, relative_path: Option<String>, force: bool) {
        let now = Instant::now();
        let enough_work = self.completed_bytes.saturating_sub(self.last_emitted_bytes)
            >= PROGRESS_BYTE_INTERVAL
            || self.completed_files.saturating_sub(self.last_emitted_files)
                >= PROGRESS_FILE_INTERVAL;
        if !force
            && !enough_work
            && now.duration_since(self.last_emitted_at) < PROGRESS_EMIT_INTERVAL
        {
            return;
        }

        let progress = CleanupProgress {
            phase,
            relative_path: relative_path.or_else(|| self.current_path.clone()),
            completed_bytes: self.completed_bytes,
            total_bytes: self.total_bytes,
            completed_files: self.completed_files,
            total_files: self.total_files,
            percent: self.percent(),
        };
        (self.on_progress)(progress);
        self.last_emitted_bytes = self.completed_bytes;
        self.last_emitted_files = self.completed_files;
        self.last_emitted_at = now;
    }

    fn percent(&self) -> u8 {
        if let Some(percent) = self
            .completed_bytes
            .min(self.total_bytes)
            .saturating_mul(100)
            .checked_div(self.total_bytes)
        {
            return percent as u8;
        }
        if let Some(percent) = self
            .completed_files
            .min(self.total_files)
            .saturating_mul(100)
            .checked_div(self.total_files)
        {
            return percent as u8;
        }
        100
    }
}

fn remove_directory_with_progress<F>(
    target: &Path,
    relative_path: &str,
    progress: &mut CleanupProgressReporter<'_, F>,
) -> std::io::Result<()>
where
    F: FnMut(CleanupProgress),
{
    let metadata = fs::symlink_metadata(target)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        let bytes = if metadata.is_file() {
            metadata.len()
        } else {
            0
        };
        fs::remove_file(target)?;
        progress.advance(
            bytes,
            u64::from(metadata.is_file()),
            relative_path.to_string(),
        );
        return Ok(());
    }

    for child in fs::read_dir(target)? {
        let child = child?;
        let child_path = child.path();
        let child_relative_path = Path::new(relative_path)
            .join(child.file_name())
            .to_string_lossy()
            .to_string();
        remove_directory_with_progress(&child_path, &child_relative_path, progress)?;
    }

    fs::remove_dir(target)
}
