use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSnapshot {
    pub branch: Option<String>,
    pub is_clean: bool,
    pub worktree_changes: u32,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileChange {
    pub path: String,
    pub status: String,
    pub additions: Option<u64>,
    pub deletions: Option<u64>,
}
