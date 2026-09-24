use std::collections::{BTreeSet, HashMap};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tokio::sync::{oneshot, Semaphore};

use crate::workspace_membership::ensure_project_in_workspace_roots;

pub struct RunControl {
    pub stop: oneshot::Sender<()>,
}

#[derive(Clone)]
pub struct AppState {
    pub runs: Arc<Mutex<HashMap<String, RunControl>>>,
    pub history_lock: Arc<Mutex<()>>,
    // A project detail inspection can walk a very large repository. Keep
    // multiple UI requests from multiplying that filesystem pressure.
    pub project_inspection_gate: Arc<Semaphore>,
    workspace_roots: Arc<Mutex<BTreeSet<PathBuf>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            runs: Arc::new(Mutex::new(HashMap::new())),
            history_lock: Arc::new(Mutex::new(())),
            project_inspection_gate: Arc::new(Semaphore::new(1)),
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
