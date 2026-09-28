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
    pub host_requirements: BuildHostRequirements,
    pub verification: BuildHostRequirements,
    pub host_mismatch_actions: Vec<CommandKind>,
    pub unverified_actions: Vec<CommandKind>,
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

    pub fn host_requirements_for_action(&self, action: &CommandKind) -> Option<&[HostOs]> {
        self.host_requirements.for_action(action)
    }

    pub fn action_supported_on_current_host(&self, action: &CommandKind) -> bool {
        self.host_requirements.action_supported_for_platform(
            action,
            &self.platform.key,
            HostOs::current(),
        )
    }

    pub fn action_verified_on_current_host(&self, action: &CommandKind) -> bool {
        HostOs::current().is_some_and(|host| {
            self.verification
                .for_action(action)
                .is_some_and(|verified_hosts| verified_hosts.contains(&host))
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BuildHostRequirements {
    pub run: Option<Vec<HostOs>>,
    pub check: Option<Vec<HostOs>>,
    pub build: Option<Vec<HostOs>>,
}

impl BuildHostRequirements {
    pub fn action_supported_for_platform(
        &self,
        action: &CommandKind,
        platform: &str,
        host: Option<HostOs>,
    ) -> bool {
        if matches!(action, CommandKind::Run) {
            if let Some(target) = HostOs::parse(platform) {
                if host != Some(target) {
                    return false;
                }
            }
        }
        self.for_action(action)
            .is_none_or(|allowed| host.is_some_and(|host| allowed.contains(&host)))
    }

    pub fn for_action(&self, action: &CommandKind) -> Option<&[HostOs]> {
        match action {
            CommandKind::Run => self.run.as_deref(),
            CommandKind::Check => self.check.as_deref(),
            CommandKind::Build => self.build.as_deref(),
            CommandKind::Other => None,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum HostOs {
    Macos,
    Windows,
    Linux,
}

impl HostOs {
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "macos" => Some(Self::Macos),
            "windows" => Some(Self::Windows),
            "linux" => Some(Self::Linux),
            _ => None,
        }
    }

    pub fn current() -> Option<Self> {
        Self::parse(std::env::consts::OS)
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Macos => "macos",
            Self::Windows => "windows",
            Self::Linux => "linux",
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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum CommandKind {
    Run,
    Check,
    Build,
    Other,
}

#[cfg(test)]
mod tests {
    use super::{BuildHostRequirements, CommandKind, HostOs};

    #[test]
    fn desktop_run_requires_matching_target_even_with_permissive_declarations() {
        let hosts = [HostOs::Macos, HostOs::Windows, HostOs::Linux];
        for run in [None, Some(hosts.to_vec())] {
            let requirements = BuildHostRequirements {
                run,
                ..Default::default()
            };
            for target in hosts {
                for host in hosts {
                    assert_eq!(
                        requirements.action_supported_for_platform(
                            &CommandKind::Run,
                            target.as_str(),
                            Some(host)
                        ),
                        target == host
                    );
                    for action in [CommandKind::Check, CommandKind::Build] {
                        assert!(requirements.action_supported_for_platform(
                            &action,
                            target.as_str(),
                            Some(host)
                        ));
                    }
                }
            }
            assert!(requirements.action_supported_for_platform(
                &CommandKind::Run,
                "web",
                Some(HostOs::Macos)
            ));
            assert!(!requirements.action_supported_for_platform(&CommandKind::Run, "macos", None));
        }
        let requirements = BuildHostRequirements {
            run: Some(vec![HostOs::Windows]),
            ..Default::default()
        };
        assert!(!requirements.action_supported_for_platform(
            &CommandKind::Run,
            "macos",
            Some(HostOs::Macos)
        ));
    }

    #[test]
    fn host_requirements_are_action_specific() {
        let current = HostOs::current().expect("test host should be supported");
        let other = match current {
            HostOs::Macos => HostOs::Windows,
            HostOs::Windows => HostOs::Macos,
            HostOs::Linux => HostOs::Macos,
        };
        let requirements = BuildHostRequirements {
            run: None,
            check: Some(vec![current]),
            build: Some(vec![other]),
        };

        assert!(requirements.action_supported_for_platform(
            &CommandKind::Run,
            "web",
            Some(current)
        ));
        assert!(requirements.action_supported_for_platform(
            &CommandKind::Check,
            "web",
            Some(current)
        ));
        assert!(!requirements.action_supported_for_platform(
            &CommandKind::Build,
            "web",
            Some(current)
        ));
    }
}
