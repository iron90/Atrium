use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tokio::sync::oneshot;

pub struct RunControl {
    pub stop: oneshot::Sender<()>,
}

#[derive(Clone, Default)]
pub struct AppState {
    pub runs: Arc<Mutex<HashMap<String, RunControl>>>,
}
