mod cleanup;
mod inspection;

pub use cleanup::clean_project_artifacts_selected_with_progress;
pub use inspection::inspect_project_storage;

#[cfg(test)]
mod tests {
    use super::{clean_project_artifacts_selected_with_progress, inspect_project_storage};
    use crate::model::{CleanupDeclaration, CleanupProgressPhase};
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
        assert!(storage.is_complete);
        assert_eq!(storage.entries.len(), 2);
        assert!(storage.entries.iter().all(|entry| entry.is_complete));

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
        let result = clean_project_artifacts_selected_with_progress(&root, &cleanup, None, |_| {})
            .expect("clean project fixture");
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
        let result = clean_project_artifacts_selected_with_progress(
            &root,
            &cleanup,
            Some(&selected),
            |_| {},
        )
        .expect("clean selected fixture");
        assert!(result.removed_entries.is_empty());
        assert!(root.join("cache/item").exists());
        assert!(root.join("source/item").exists());

        fs::remove_dir_all(root).expect("remove storage fixture");
    }

    #[test]
    fn cleanup_reports_file_progress() {
        let root = fixture_root("progress");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("build/nested")).expect("create build fixture");
        fs::write(root.join("build/app.js"), b"12345").expect("write build fixture");
        fs::write(root.join("build/nested/map"), b"123").expect("write build fixture");

        let cleanup = CleanupDeclaration {
            cache: Vec::new(),
            build: vec!["build".to_string()],
        };
        let selected = vec!["build".to_string()];
        let mut progress = Vec::new();
        let result = clean_project_artifacts_selected_with_progress(
            &root,
            &cleanup,
            Some(&selected),
            |event| progress.push(event),
        )
        .expect("clean project fixture");

        assert!(result.failed_entries.is_empty());
        assert_eq!(
            progress.first().map(|event| &event.phase),
            Some(&CleanupProgressPhase::Preparing)
        );
        assert_eq!(
            progress.last().map(|event| &event.phase),
            Some(&CleanupProgressPhase::Finalizing)
        );
        let final_progress = progress.last().expect("final cleanup progress");
        assert_eq!(final_progress.percent, 100);
        assert_eq!(final_progress.total_bytes, 8);
        assert_eq!(final_progress.completed_bytes, 8);
        assert_eq!(final_progress.total_files, 2);
        assert_eq!(final_progress.completed_files, 2);
        assert!(!root.join("build").exists());

        fs::remove_dir_all(root).expect("remove storage fixture");
    }

    #[cfg(unix)]
    #[test]
    fn cleanup_does_not_follow_symbolic_linked_directories() {
        use std::os::unix::fs::symlink;

        let root = fixture_root("symlink-root");
        let outside = fixture_root("symlink-outside");
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
        fs::create_dir_all(outside.join("cache")).expect("create outside cache directory");
        fs::write(outside.join("cache/item"), b"outside").expect("write outside cache");
        fs::create_dir_all(&root).expect("create project directory");
        symlink(&outside, root.join("linked")).expect("create project symlink");

        let cleanup = CleanupDeclaration {
            cache: vec!["linked/cache".to_string()],
            build: Vec::new(),
        };
        let result = clean_project_artifacts_selected_with_progress(&root, &cleanup, None, |_| {})
            .expect("clean project fixture");

        assert!(result.removed_entries.is_empty());
        assert!(outside.join("cache/item").exists());

        fs::remove_dir_all(root).expect("remove project fixture");
        fs::remove_dir_all(outside).expect("remove outside fixture");
    }

    #[cfg(unix)]
    #[test]
    fn entries_measured_independently_of_the_whole_project_hardlink_accounting() {
        use std::fs::hard_link;
        use std::os::unix::fs::symlink;

        // The project root is reached through a symlink, so the whole-project
        // walk and the canonical cleanable target use different path prefixes.
        // Bookkeeping shared between the two walks would count the entry's
        // hardlinked file as already seen and report it as zero bytes.
        let real = fixture_root("entry-metrics-real");
        let link = fixture_root("entry-metrics-link");
        let _ = fs::remove_dir_all(&real);
        let _ = fs::remove_dir_all(&link);
        fs::create_dir_all(real.join("build-out")).expect("create build fixture");
        fs::write(real.join("build-out/blob"), b"0123456789").expect("write build fixture");
        hard_link(real.join("build-out/blob"), real.join("blob-twin")).expect("hard link fixture");
        symlink(&real, &link).expect("create root symlink");

        let cleanup = CleanupDeclaration {
            cache: Vec::new(),
            build: vec!["build-out".to_string()],
        };
        let storage = inspect_project_storage(&link, &cleanup);

        assert_eq!(storage.entries.len(), 1);
        let entry = &storage.entries[0];
        assert!(entry.is_complete);
        assert_eq!(entry.bytes, 10);
        assert_eq!(entry.file_count, 1);
        // The project total still counts the shared inode exactly once.
        assert_eq!(storage.total_bytes, 10);

        fs::remove_dir_all(real).expect("remove project fixture");
        fs::remove_dir_all(link).expect("remove link fixture");
    }
}
