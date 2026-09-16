use std::fs;
use std::path::Path;

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub(crate) struct PathMetrics {
    pub bytes: u64,
    pub file_count: u64,
    pub modified_at: Option<i64>,
    pub is_complete: bool,
}

pub(crate) fn measure_path(path: &Path) -> PathMetrics {
    let Ok(metadata) = fs::symlink_metadata(path) else {
        return PathMetrics::default();
    };
    if metadata.file_type().is_symlink() {
        return PathMetrics::default();
    }
    if metadata.is_file() {
        return PathMetrics {
            bytes: metadata.len(),
            file_count: 1,
            modified_at: modified_millis(&metadata),
            is_complete: true,
        };
    }
    if !metadata.is_dir() {
        return PathMetrics::default();
    }

    let mut total = PathMetrics {
        modified_at: modified_millis(&metadata),
        is_complete: true,
        ..PathMetrics::default()
    };
    let Ok(entries) = fs::read_dir(path) else {
        total.is_complete = false;
        return total;
    };
    for entry in entries {
        let Ok(entry) = entry else {
            total.is_complete = false;
            continue;
        };
        let child = measure_path(&entry.path());
        total.bytes += child.bytes;
        total.file_count += child.file_count;
        total.modified_at = max_modified(total.modified_at, child.modified_at);
        total.is_complete &= child.is_complete;
    }
    total
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
    use super::{measure_path, PathMetrics};
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
}
