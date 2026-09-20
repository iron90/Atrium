use serde::{Deserialize, Serialize};

use super::project::ProjectConfigurationStatus;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtocolStatus {
    pub manifest_path: String,
    pub schema: Option<u32>,
    pub needs_update: bool,
    pub manifest_status: ProjectConfigurationStatus,
    pub capabilities: Vec<ProtocolCapability>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuidanceStatus {
    pub revision: Option<u32>,
    pub needs_update: bool,
    pub needs_sync: bool,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IconConformance {
    pub status: IconConformanceStatus,
    pub manifest_path: String,
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
pub struct ProjectConfigurationReport {
    pub path: String,
    pub status: ProjectConfigurationStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectGuidanceReport {
    pub paths: Vec<String>,
    pub configuration_status: ProjectConfigurationStatus,
    pub guidance_revision: u32,
}
