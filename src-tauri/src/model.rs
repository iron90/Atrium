use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub root_path: String,
    pub scanned_at: i64,
    pub projects: Vec<ProjectSnapshot>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSnapshot {
    pub id: String,
    pub name: String,
    pub path: String,
    pub description: Option<String>,
    pub icon: Option<ProjectIcon>,
    pub icon_conformance: IconConformance,
    pub protocol: ProtocolStatus,
    pub repo: Option<GitSnapshot>,
    pub tools: ProjectTools,
    pub links: Vec<ProjectLink>,
    pub platforms: Vec<Facet>,
    pub channels: Vec<Facet>,
    pub build_profiles: Vec<BuildProfile>,
    pub configuration: ProjectConfiguration,
    pub commands: Vec<ProjectCommand>,
    pub cleanup: CleanupDeclaration,
    pub storage: Option<ProjectStorage>,
    pub artifacts: Option<Vec<BuildArtifact>>,
    pub scanned_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtocolStatus {
    pub manifest_path: String,
    pub schema: Option<u32>,
    pub manifest_status: ProjectConfigurationStatus,
    pub capabilities: Vec<ProtocolCapability>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtocolCapability {
    pub id: String,
    pub status: ProtocolCapabilityStatus,
    pub evidence: Vec<String>,
    pub issues: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ProtocolCapabilityStatus {
    Configured,
    Partial,
    Missing,
    Invalid,
    Legacy,
}

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
    pub entries: Vec<StorageEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageEntry {
    pub relative_path: String,
    pub kind: StorageEntryKind,
    pub bytes: u64,
    pub file_count: u64,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfiguration {
    pub status: ProjectConfigurationStatus,
    pub manifest_path: String,
    pub issues: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ProjectConfigurationStatus {
    Configured,
    Missing,
    Invalid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildProfile {
    pub id: String,
    pub label: String,
    pub platform: Facet,
    pub channel: Facet,
    pub run_command_id: Option<String>,
    pub check_command_id: Option<String>,
    pub build_command_id: Option<String>,
    pub source: String,
    pub region: Option<String>,
    pub payment: Option<String>,
    pub artifacts: Vec<String>,
    pub issues: Vec<String>,
}

impl BuildProfile {
    pub fn command_id_for_action(&self, action: &CommandKind) -> Option<&str> {
        match action {
            CommandKind::Run => self.run_command_id.as_deref(),
            CommandKind::Check => self.check_command_id.as_deref(),
            CommandKind::Build => self.build_command_id.as_deref(),
            CommandKind::Other => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IconConformance {
    pub status: IconConformanceStatus,
    pub manifest_path: String,
    pub report_path: String,
    pub declared_icon: Option<String>,
    pub resolved_icon: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum IconConformanceStatus {
    Compliant,
    Legacy,
    Missing,
    Invalid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IconConformanceReport {
    pub path: String,
    pub status: IconConformanceStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfigurationReport {
    pub path: String,
    pub status: ProjectConfigurationStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectGuidanceReport {
    pub paths: Vec<String>,
    pub configuration_status: ProjectConfigurationStatus,
    pub icon_status: IconConformanceStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectIcon {
    pub data_url: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Facet {
    pub key: String,
    pub label: String,
    pub source: FacetSource,
    pub evidence: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FacetSource {
    Detected,
    Configured,
}

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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTools {
    pub terminal: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectLink {
    pub id: String,
    pub label: String,
    pub url: String,
    pub kind: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCommand {
    pub id: String,
    pub kind: CommandKind,
    pub label: String,
    pub program: String,
    pub args: Vec<String>,
    pub working_directory: String,
    pub display_command: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CommandKind {
    Run,
    Check,
    Build,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunStarted {
    pub run_id: String,
    pub project_id: String,
    pub command_id: String,
    pub profile_id: Option<String>,
    pub display_command: String,
    pub started_at: i64,
    pub status: RunStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunOutput {
    pub run_id: String,
    pub stream: OutputStream,
    pub line: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunError {
    pub run_id: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OutputStream {
    Stdout,
    Stderr,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunFinished {
    pub run_id: String,
    pub project_id: String,
    pub command_id: String,
    pub profile_id: Option<String>,
    pub profile_action: Option<CommandKind>,
    pub project_path: String,
    pub platform: Option<Facet>,
    pub channel: Option<Facet>,
    pub git_branch: Option<String>,
    pub git_commit: Option<String>,
    pub worktree_clean: Option<bool>,
    pub display_command: String,
    pub started_at: i64,
    pub finished_at: i64,
    pub duration_ms: i64,
    pub status: RunStatus,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RunStatus {
    Running,
    Succeeded,
    Failed,
    Cancelled,
}
