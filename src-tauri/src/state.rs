use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tokio::sync::{oneshot, Semaphore};

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
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            runs: Arc::new(Mutex::new(HashMap::new())),
            history_lock: Arc::new(Mutex::new(())),
            project_inspection_gate: Arc::new(Semaphore::new(1)),
        }
    }
}
