use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSnapshot {
    pub branch: Option<String>,
    pub is_clean: bool,
    pub worktree_changes: u32,
    pub worktree_status_available: bool,
    pub remote: Option<String>,
    pub ahead: Option<u32>,
    pub behind: Option<u32>,
    pub last_commit: Option<GitCommit>,
    pub recent_commits: Vec<GitCommit>,
    pub references: Vec<GitReference>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitReference {
    pub name: String,
    pub kind: GitReferenceKind,
    pub sha: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GitReferenceKind {
    Branch,
    Tag,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub sha: String,
    pub short_sha: String,
    pub author: String,
    pub timestamp: i64,
    pub subject: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChangeSummary {
    pub project_path: String,
    pub from: String,
    pub to: String,
    pub commits: Vec<GitCommit>,
    pub files: Vec<GitFileChange>,
    pub insertions: u64,
    pub deletions: u64,
}

// A read-only view of one branch: its recent commits and how it relates to
// the checked-out HEAD. Never produced by checkout — the worktree and HEAD
// stay exactly where the project Agent left them.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchOverview {
    pub branch: String,
    pub commits: Vec<GitCommit>,
    pub ahead_of_head: u32,
    pub behind_head: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileChange {
    pub path: String,
    pub status: String,
    pub additions: Option<u64>,
    pub deletions: Option<u64>,
}
