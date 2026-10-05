use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};

use crate::model::ProjectSnapshot;
use crate::project_scan::scan_project;
use crate::time::now_millis;

// Mtime hints for every fact source a scan reads. A worktree-only edit
// (inside src/) touches none of them, so such facts refresh through the
// forced full scan instead of per-poll detection.
const WATCHED_FILES: &[&str] = &[
    ".atrium/manifest.toml",
    ".git/HEAD",
    ".git/index",
    "package.json",
    "Cargo.toml",
    "pubspec.yaml",
    "go.mod",
    "pyproject.toml",
    "requirements.txt",
    "build.gradle",
    "build.gradle.kts",
    "settings.gradle",
    "settings.gradle.kts",
    "pom.xml",
    "mix.exs",
    "Makefile",
];

// Worktree dirty state and icon files cannot be detected cheaply; their
// staleness is bounded by this window instead of paying a full worktree
// walk on every poll.
const FULL_SCAN_INTERVAL: Duration = Duration::from_secs(60);
const MAX_CACHE_ENTRIES: usize = 512;

#[derive(Clone, Default)]
pub struct ScanCache {
    entries: Arc<Mutex<HashMap<PathBuf, CachedScan>>>,
}

struct CachedScan {
    signature: ScanSignature,
    last_full_scan: Instant,
    snapshot: ProjectSnapshot,
}

#[derive(Debug, PartialEq)]
struct ScanSignature {
    root_mtime: Option<SystemTime>,
    watched: Vec<Option<SystemTime>>,
}

impl ScanSignature {
    fn capture(project_path: &Path) -> ScanSignature {
        let root_mtime = fs_modified(project_path);
        let watched = WATCHED_FILES
            .iter()
            .map(|relative| fs_modified(&project_path.join(relative)))
            .collect();
        ScanSignature {
            root_mtime,
            watched,
        }
    }
}

fn fs_modified(path: &Path) -> Option<SystemTime> {
    std::fs::metadata(path).ok()?.modified().ok()
}

impl ScanCache {
    // Returns the cached snapshot when the cheap signature is unchanged and
    // the forced full-scan window has not elapsed; otherwise scans and
    // stores. Locks are only held for lookups and inserts, never across the
    // scan itself, so roots keep scanning concurrently.
    pub fn cached_or_scan(&self, project_path: &Path) -> Option<ProjectSnapshot> {
        let signature = ScanSignature::capture(project_path);
        let now = Instant::now();
        let canonical = project_path.canonicalize().ok()?;
        if let Some(entry) = self.entries.lock().ok()?.get(&canonical) {
            if entry.signature == signature
                && now.duration_since(entry.last_full_scan) < FULL_SCAN_INTERVAL
            {
                let mut snapshot = entry.snapshot.clone();
                snapshot.scanned_at = now_millis();
                return Some(snapshot);
            }
        }

        let snapshot = scan_project(project_path)?;
        let mut entries = self.entries.lock().ok()?;
        if entries.len() >= MAX_CACHE_ENTRIES {
            entries.clear();
        }
        entries.insert(
            canonical,
            CachedScan {
                signature,
                last_full_scan: now,
                snapshot: snapshot.clone(),
            },
        );
        Some(snapshot)
    }
}

#[cfg(test)]
mod tests {
    use super::{ScanCache, ScanSignature};
    use std::fs;
    use std::thread;
    use std::time::Duration;

    // Windows assigns file timestamps at ~15.6 ms granularity; a rewrite
    // within the same tick leaves the mtime signature unchanged.
    fn bump_past_timestamp_granularity() {
        thread::sleep(Duration::from_millis(100));
    }

    fn fixture_root(name: &str) -> std::path::PathBuf {
        let root =
            std::env::temp_dir().join(format!("atrium-scan-cache-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create fixture project");
        root
    }

    #[test]
    fn unchanged_projects_return_the_cached_snapshot() {
        let root = fixture_root("hit");
        fs::write(root.join("package.json"), r#"{"name":"app"}"#).expect("write marker");
        let cache = ScanCache::default();

        let first = cache
            .cached_or_scan(&root)
            .expect("first scan populates the cache");
        let second = cache
            .cached_or_scan(&root)
            .expect("second scan resolves from the cache");

        assert_eq!(first.id, second.id);
        assert_eq!(first.name, second.name);

        fs::remove_dir_all(root).expect("remove fixture project");
    }

    #[test]
    fn changed_fact_sources_bypass_the_cache() {
        let root = fixture_root("change");
        fs::write(root.join("package.json"), r#"{"name":"before"}"#).expect("write marker");
        let cache = ScanCache::default();
        cache
            .cached_or_scan(&root)
            .expect("initial scan populates the cache");

        bump_past_timestamp_granularity();
        fs::write(
            root.join("package.json"),
            r#"{"name":"renamed-fixture-project"}"#,
        )
        .expect("rewrite marker");

        let refreshed = cache
            .cached_or_scan(&root)
            .expect("changed signature forces a full scan");
        assert_eq!(refreshed.name, "renamed-fixture-project");

        fs::remove_dir_all(root).expect("remove fixture project");
    }

    #[test]
    fn signatures_match_until_a_watched_fact_source_changes() {
        let root = fixture_root("signature");
        fs::write(root.join("package.json"), "{}").expect("write marker");
        let before = ScanSignature::capture(&root);

        // Appending content moves the mtime of the watched fact source.
        bump_past_timestamp_granularity();
        let mut marker = fs::read_to_string(root.join("package.json")).expect("read marker");
        marker.push('\n');
        fs::write(root.join("package.json"), marker).expect("bump marker mtime");

        let after = ScanSignature::capture(&root);
        assert_ne!(before, after);

        fs::remove_dir_all(root).expect("remove fixture project");
    }
}
