use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CleanupDeclaration {
    pub cache: Vec<String>,
    pub build: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectStorage {
    pub total_bytes: u64,
    pub cleanable_bytes: u64,
    pub is_complete: bool,
    pub entries: Vec<StorageEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageEntry {
    pub relative_path: String,
    pub kind: StorageEntryKind,
    pub bytes: u64,
    pub file_count: u64,
    pub is_complete: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupProgress {
    pub phase: CleanupProgressPhase,
    pub relative_path: Option<String>,
    pub completed_bytes: u64,
    pub total_bytes: u64,
    pub completed_files: u64,
    pub total_files: u64,
    pub percent: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CleanupProgressPhase {
    Preparing,
    Deleting,
    Finalizing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildArtifact {
    pub profile_id: String,
    pub profile_label: String,
    pub relative_path: String,
    pub kind: BuildArtifactKind,
    pub bytes: u64,
    pub file_count: u64,
    pub modified_at: Option<i64>,
    pub is_complete: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BuildArtifactKind {
    File,
    Directory,
    Missing,
    Invalid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StorageEntryKind {
    Cache,
    Build,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageCleanupFailure {
    pub relative_path: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupResult {
    pub removed_bytes: u64,
    pub removed_entries: Vec<StorageEntry>,
    pub failed_entries: Vec<StorageCleanupFailure>,
    pub storage: ProjectStorage,
}
