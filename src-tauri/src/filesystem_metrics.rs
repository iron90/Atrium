use std::collections::HashMap;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

const MAX_METRICS_DEPTH: u16 = 128;

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub(crate) struct PathMetrics {
    pub bytes: u64,
    pub file_count: u64,
    pub modified_at: Option<i64>,
    pub is_complete: bool,
}

#[derive(Default)]
pub(crate) struct PathMetricsCache {
    metrics: HashMap<PathBuf, PathMetrics>,
    // Hard links share one inode, so the same storage can be reached through
    // several paths (rustc's incremental cache hardlinks every session's
    // object files). Counting per path would multiply the project's apparent
    // size; like du/df, only the first path seen contributes.
    #[cfg(unix)]
    counted_inodes: HashSet<(u64, u64)>,
}

impl PathMetricsCache {
    pub(crate) fn measure(&mut self, path: &Path) -> PathMetrics {
        self.measure_at_depth(path, 0)
    }

    fn measure_at_depth(&mut self, path: &Path, depth: u16) -> PathMetrics {
        if depth > MAX_METRICS_DEPTH {
            return PathMetrics {
                is_complete: false,
                ..PathMetrics::default()
            };
        }
        if let Some(metrics) = self.metrics.get(path) {
            return *metrics;
        }

        let (metrics, is_directory) = self.measure_uncached(path, depth);
        if is_directory {
            self.metrics.insert(path.to_path_buf(), metrics);
        }
        metrics
    }

    fn measure_uncached(&mut self, path: &Path, depth: u16) -> (PathMetrics, bool) {
        let Ok(metadata) = fs::symlink_metadata(path) else {
            return (PathMetrics::default(), false);
        };
        if metadata.file_type().is_symlink() {
            // Symlinks are intentionally not followed: their targets may be
            // outside the project or point back into an already scanned tree.
            // Skipping one is a complete metrics result, not a read failure.
            return (
                PathMetrics {
                    is_complete: true,
                    ..PathMetrics::default()
                },
                false,
            );
        }
        if metadata.is_file() {
            #[cfg(unix)]
            {
                use std::os::unix::fs::MetadataExt;
                if metadata.nlink() > 1
                    && !self.counted_inodes.insert((metadata.dev(), metadata.ino()))
                {
                    return (
                        PathMetrics {
                            is_complete: true,
                            ..PathMetrics::default()
                        },
                        false,
                    );
                }
            }
            return (
                PathMetrics {
                    bytes: metadata.len(),
                    file_count: 1,
                    modified_at: modified_millis(&metadata),
                    is_complete: true,
                },
                false,
            );
        }
        if !metadata.is_dir() {
            return (PathMetrics::default(), false);
        }

        let mut total = PathMetrics {
            modified_at: modified_millis(&metadata),
            is_complete: true,
            ..PathMetrics::default()
        };
        let Ok(entries) = fs::read_dir(path) else {
            total.is_complete = false;
            return (total, true);
        };
        for entry in entries {
            let Ok(entry) = entry else {
                total.is_complete = false;
                continue;
            };
            let child = self.measure_at_depth(&entry.path(), depth + 1);
            let bytes_complete = add_metric(&mut total.bytes, child.bytes);
            let files_complete = add_metric(&mut total.file_count, child.file_count);
            total.modified_at = max_modified(total.modified_at, child.modified_at);
            total.is_complete &= child.is_complete && bytes_complete && files_complete;
        }
        (total, true)
    }
}

pub(crate) fn measure_path(path: &Path) -> PathMetrics {
    PathMetricsCache::default().measure(path)
}

fn add_metric(total: &mut u64, value: u64) -> bool {
    let Some(sum) = total.checked_add(value) else {
        *total = u64::MAX;
        return false;
    };
    *total = sum;
    true
}

fn modified_millis(metadata: &fs::Metadata) -> Option<i64> {
    metadata
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis().min(i64::MAX as u128) as i64)
}

fn max_modified(left: Option<i64>, right: Option<i64>) -> Option<i64> {
    match (left, right) {
        (Some(left), Some(right)) => Some(left.max(right)),
        (Some(value), None) | (None, Some(value)) => Some(value),
        (None, None) => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{add_metric, measure_path, PathMetrics, PathMetricsCache, MAX_METRICS_DEPTH};
    use std::fs;

    #[test]
    fn measures_files_and_directories_with_one_policy() {
        let root =
            std::env::temp_dir().join(format!("atrium-filesystem-metrics-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("nested")).expect("create metrics fixture");
        fs::write(root.join("nested/item"), b"metrics").expect("write metrics fixture");

        assert_eq!(
            measure_path(&root).file_count,
            1,
            "directories do not count as files"
        );
        assert_eq!(measure_path(&root).bytes, 7);
        assert!(measure_path(&root).is_complete);
        assert_ne!(measure_path(&root), PathMetrics::default());

        fs::remove_dir_all(root).expect("remove metrics fixture");
    }

    #[test]
    fn marks_missing_paths_as_incomplete() {
        let path = std::env::temp_dir().join(format!(
            "atrium-filesystem-metrics-missing-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&path);

        assert!(!measure_path(&path).is_complete);
    }

    #[cfg(unix)]
    #[test]
    fn skips_symlinks_without_marking_the_parent_scan_incomplete() {
        use std::os::unix::fs::symlink;

        let root = std::env::temp_dir().join(format!(
            "atrium-filesystem-metrics-symlink-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create metrics fixture");
        fs::write(root.join("real-file"), b"metrics").expect("write metrics fixture");
        symlink(root.join("real-file"), root.join("shortcut")).expect("create symlink fixture");

        let metrics = measure_path(&root);

        assert_eq!(metrics.bytes, 7);
        assert_eq!(metrics.file_count, 1);
        assert!(metrics.is_complete);

        fs::remove_dir_all(root).expect("remove metrics fixture");
    }

    #[test]
    fn reuses_metrics_for_paths_seen_during_a_parent_scan() {
        let root = std::env::temp_dir().join(format!(
            "atrium-filesystem-metrics-cache-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("nested")).expect("create metrics fixture");
        fs::write(root.join("nested/item"), b"metrics").expect("write metrics fixture");

        let mut cache = PathMetricsCache::default();
        let total = cache.measure(&root);
        let cached_path_count = cache.metrics.len();
        let nested = cache.measure(&root.join("nested"));

        assert_eq!(nested.bytes, 7);
        assert_eq!(nested.file_count, 1);
        assert_eq!(total.bytes, nested.bytes);
        assert_eq!(cache.metrics.len(), cached_path_count);
        assert_eq!(cached_path_count, 2, "only directories are cached");

        fs::remove_dir_all(root).expect("remove metrics fixture");
    }

    #[cfg(unix)]
    #[test]
    fn counts_hardlinked_paths_once_like_disk_usage() {
        use std::os::unix::fs::MetadataExt;

        let root =
            std::env::temp_dir().join(format!("atrium-metrics-hardlink-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create hardlink fixture");
        fs::write(root.join("original"), b"metrics").expect("write original file");
        let original = fs::metadata(root.join("original")).expect("stat original file");
        fs::hard_link(root.join("original"), root.join("alias")).expect("hard link original");
        assert_eq!(
            fs::metadata(root.join("alias"))
                .expect("stat alias file")
                .ino(),
            original.ino()
        );
        fs::write(root.join("unrelated"), b"12345").expect("write unrelated file");

        let metrics = measure_path(&root);

        // 7 bytes for the shared inode once, 5 for the unrelated file.
        assert_eq!(metrics.bytes, 12);
        assert_eq!(metrics.file_count, 2);

        fs::remove_dir_all(root).expect("remove hardlink fixture");
    }

    #[test]
    fn saturates_overflowed_metrics_and_marks_the_total_incomplete() {
        let mut total = PathMetrics {
            bytes: u64::MAX - 1,
            file_count: u64::MAX - 1,
            is_complete: true,
            ..PathMetrics::default()
        };

        let bytes_complete = add_metric(&mut total.bytes, 2);
        let files_complete = add_metric(&mut total.file_count, 2);
        total.is_complete &= bytes_complete && files_complete;

        assert_eq!(total.bytes, u64::MAX);
        assert_eq!(total.file_count, u64::MAX);
        assert!(!total.is_complete);
    }

    #[test]
    fn stops_at_the_directory_depth_limit() {
        let root = std::env::temp_dir().join(format!(
            "atrium-filesystem-metrics-depth-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let mut deepest = root.clone();
        for depth in 0..=MAX_METRICS_DEPTH {
            deepest.push(format!("d{depth:03}"));
        }
        fs::create_dir_all(&deepest).expect("create deep metrics fixture");

        let metrics = measure_path(&root);

        assert!(!metrics.is_complete);
        fs::remove_dir_all(root).expect("remove metrics fixture");
    }
}
