use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tokio::sync::{oneshot, Semaphore};

use crate::model::ProjectStorage;
use crate::scan_cache::ScanCache;
use crate::workspace_membership::ensure_project_in_workspace_roots;

pub struct RunControl {
    pub stop: oneshot::Sender<()>,
}

// Walking a huge repository to measure storage is expensive; a short-lived
// cache keeps repeated project selections from re-walking the same tree.
const STORAGE_METRICS_TTL: Duration = Duration::from_secs(60);

#[derive(Clone, Default)]
pub struct StorageMetricsCache {
    entries: Arc<Mutex<HashMap<PathBuf, (Instant, ProjectStorage)>>>,
}

impl StorageMetricsCache {
    pub fn lookup(&self, project_path: &Path) -> Option<ProjectStorage> {
        let canonical = project_path.canonicalize().ok()?;
        let entries = self.entries.lock().ok()?;
        let (measured_at, storage) = entries.get(&canonical)?;
        (measured_at.elapsed() < STORAGE_METRICS_TTL).then(|| storage.clone())
    }

    pub fn store(&self, project_path: &Path, storage: ProjectStorage) {
        let Ok(canonical) = project_path.canonicalize() else {
            return;
        };
        if let Ok(mut entries) = self.entries.lock() {
            entries.insert(canonical, (Instant::now(), storage));
        }
    }

    pub fn invalidate(&self, project_path: &Path) {
        if let Ok(canonical) = project_path.canonicalize() {
            if let Ok(mut entries) = self.entries.lock() {
                entries.remove(&canonical);
            }
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    pub runs: Arc<Mutex<HashMap<String, RunControl>>>,
    pub history_lock: Arc<Mutex<()>>,
    // A project detail inspection can walk a very large repository. Keep
    // multiple UI requests from multiplying that filesystem pressure.
    pub project_inspection_gate: Arc<Semaphore>,
    pub scan_cache: ScanCache,
    pub storage_metrics_cache: StorageMetricsCache,
    workspace_roots: Arc<Mutex<BTreeSet<PathBuf>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            runs: Arc::new(Mutex::new(HashMap::new())),
            history_lock: Arc::new(Mutex::new(())),
            project_inspection_gate: Arc::new(Semaphore::new(1)),
            scan_cache: ScanCache::default(),
            storage_metrics_cache: StorageMetricsCache::default(),
            workspace_roots: Arc::new(Mutex::new(BTreeSet::new())),
        }
    }
}

impl AppState {
    pub fn register_workspace_root(&self, root: PathBuf) {
        match self.workspace_roots.lock() {
            Ok(mut roots) => {
                roots.insert(root);
            }
            Err(error) => {
                eprintln!("Atrium could not register workspace root: {error}");
            }
        }
    }

    // The frontend owns the root list; syncing it after every scan lets a
    // removed root lose its authorization for run/inspect/cleanup actions
    // within the same session.
    pub fn replace_workspace_roots(&self, root_paths: &[PathBuf]) {
        let canonical: BTreeSet<PathBuf> = root_paths
            .iter()
            .filter_map(|path| path.canonicalize().ok())
            .collect();
        match self.workspace_roots.lock() {
            Ok(mut roots) => {
                *roots = canonical;
            }
            Err(error) => {
                eprintln!("Atrium could not sync workspace roots: {error}");
            }
        }
    }

    pub fn ensure_project_in_workspace(
        &self,
        project_path: &std::path::Path,
    ) -> Result<(), String> {
        let roots = self
            .workspace_roots
            .lock()
            .map_err(|_| "Workspace registry is unavailable".to_string())?;
        ensure_project_in_workspace_roots(&roots, project_path)
    }
}

#[cfg(test)]
mod tests {
    use super::StorageMetricsCache;
    use crate::model::ProjectStorage;
    use std::fs;
    use std::time::{Duration, Instant};

    fn fixture_root(name: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!(
            "atrium-storage-cache-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create fixture project");
        root
    }

    fn sample_storage() -> ProjectStorage {
        ProjectStorage {
            total_bytes: 10,
            cleanable_bytes: 4,
            is_complete: true,
            entries: vec![],
        }
    }

    #[test]
    fn stores_looks_up_and_invalidates_measured_storage() {
        let root = fixture_root("hit");
        let cache = StorageMetricsCache::default();
        let storage = sample_storage();

        assert!(cache.lookup(&root).is_none());
        cache.store(&root, storage.clone());
        let cached = cache.lookup(&root).expect("cached storage entry");
        assert_eq!(cached.total_bytes, storage.total_bytes);
        assert_eq!(cached.cleanable_bytes, storage.cleanable_bytes);

        cache.invalidate(&root);
        assert!(cache.lookup(&root).is_none());

        fs::remove_dir_all(root).expect("remove fixture project");
    }

    #[test]
    fn cached_storage_expires_after_the_ttl() {
        let root = fixture_root("ttl");
        let cache = StorageMetricsCache::default();
        cache.store(&root, sample_storage());

        // Advance wall clock past the TTL without sleeping by measuring a
        // stale entry: store again from a "future" measurement is not
        // possible, so instead verify lookup expiry via a direct entry edit.
        {
            let canonical = root.canonicalize().expect("canonical fixture root");
            let mut entries = cache.entries.lock().expect("lock entries");
            if let Some((measured_at, _)) = entries.get_mut(&canonical) {
                *measured_at = Instant::now() - Duration::from_secs(120);
            }
        }

        assert!(cache.lookup(&root).is_none());

        fs::remove_dir_all(root).expect("remove fixture project");
    }
}
