use serde::{Deserialize, Serialize};

use super::{
    git::GitSnapshot,
    protocol::{GuidanceStatus, IconConformance, ProtocolStatus},
    storage::{BuildArtifact, CleanupDeclaration, ProjectStorage},
};

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
    pub modified_at: Option<i64>,
    pub description: Option<String>,
    pub icon: Option<ProjectIcon>,
    pub icon_conformance: IconConformance,
    pub protocol: ProtocolStatus,
    pub guidance: GuidanceStatus,
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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ProjectConfigurationStatus {
    Configured,
    Missing,
    Invalid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfiguration {
    pub status: ProjectConfigurationStatus,
    pub manifest_path: String,
    pub issues: Vec<String>,
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
