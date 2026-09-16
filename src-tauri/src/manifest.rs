use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

use serde::Deserialize;

use crate::conformance::{write_icon_conformance_report, MANIFEST_PATH};
use crate::model::{
    BuildProfile, CleanupDeclaration, Facet, FacetSource, IconConformance, IconConformanceStatus,
    ProjectCommand, ProjectConfiguration, ProjectConfigurationReport, ProjectConfigurationStatus,
    ProjectGuidanceReport, ProjectLink, ProjectSnapshot, ProjectTools, ProtocolCapability,
    ProtocolCapabilityStatus, ProtocolStatus,
};

pub const CONFIGURATION_REPORT_PATH: &str = ".atrium/reports/project-configuration.md";

#[derive(Debug)]
pub struct ProjectConfigurationInspection {
    pub platforms: Vec<Facet>,
    pub channels: Vec<Facet>,
    pub build_profiles: Vec<BuildProfile>,
    pub cleanup: CleanupDeclaration,
    pub tools: ProjectTools,
    pub links: Vec<ProjectLink>,
    pub manifest_status: ProjectConfigurationStatus,
    pub manifest_schema: Option<u32>,
    pub cleanup_issues: Vec<String>,
    pub configuration: ProjectConfiguration,
}

#[derive(Debug, Deserialize)]
struct ManifestDocument {
    schema: u32,
    platforms: Option<Vec<ManifestFacet>>,
    channels: Option<Vec<ManifestFacet>>,
    build_profiles: Option<Vec<ManifestBuildProfile>>,
    cleanup: Option<ManifestCleanup>,
    tools: Option<ManifestTools>,
    links: Option<Vec<ManifestLink>>,
}

#[derive(Debug, Deserialize)]
struct ManifestFacet {
    id: String,
    label: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ManifestBuildProfile {
    id: String,
    label: Option<String>,
    platform: String,
    channel: String,
    commands: Option<ManifestCommands>,
    region: Option<String>,
    payment: Option<String>,
    artifacts: Option<Vec<String>>,
}

#[derive(Debug, Default, Deserialize)]
struct ManifestCommands {
    run: Option<String>,
    check: Option<String>,
    build: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct ManifestCleanup {
    cache: Option<Vec<String>>,
    build: Option<Vec<String>>,
}

#[derive(Debug, Default, Deserialize)]
struct ManifestTools {
    terminal: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ManifestLink {
    id: String,
    label: Option<String>,
    url: String,
    kind: Option<String>,
}

pub fn scan_project_configuration(
    project_path: &Path,
    commands: &[ProjectCommand],
) -> ProjectConfigurationInspection {
    let manifest_path = project_path.join(MANIFEST_PATH);
    let raw = match fs::read_to_string(&manifest_path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return missing_configuration();
        }
        Err(error) => {
            return invalid_configuration(
                vec![format!("Cannot read {MANIFEST_PATH}: {error}")],
                None,
            );
        }
    };

    let document = match toml::from_str::<ManifestDocument>(&raw) {
        Ok(document) => document,
        Err(error) => {
            return invalid_configuration(
                vec![format!("Cannot parse {MANIFEST_PATH}: {error}")],
                None,
            );
        }
    };

    if document.schema != 1 {
        return invalid_configuration(
            vec![format!(
                "Unsupported Atrium manifest schema: {}. Expected schema 1.",
                document.schema
            )],
            Some(document.schema),
        );
    }

    let mut issues = Vec::new();
    let platforms = build_facets(
        document.platforms.unwrap_or_default(),
        "platforms",
        &mut issues,
    );
    let channels = build_facets(
        document.channels.unwrap_or_default(),
        "channels",
        &mut issues,
    );
    let platform_map = facets_by_key(&platforms);
    let channel_map = facets_by_key(&channels);
    let cleanup_issue_start = issues.len();
    let cleanup = parse_cleanup(document.cleanup, &mut issues);
    let cleanup_issues = issues[cleanup_issue_start..].to_vec();
    let tools = parse_tools(document.tools);
    let links = parse_links(document.links.unwrap_or_default(), &mut issues);
    let mut profile_ids = HashSet::new();
    let mut build_profiles = Vec::new();

    for manifest_profile in document.build_profiles.unwrap_or_default() {
        let profile_source = format!("{MANIFEST_PATH}#build_profiles.{}", manifest_profile.id);
        if manifest_profile.id.trim().is_empty() {
            issues.push("A build profile is missing its id.".to_string());
            continue;
        }
        if !profile_ids.insert(manifest_profile.id.clone()) {
            issues.push(format!(
                "Duplicate build profile id: {}.",
                manifest_profile.id
            ));
            continue;
        }

        let mut profile_issues = Vec::new();
        let platform = platform_map
            .get(&manifest_profile.platform)
            .cloned()
            .unwrap_or_else(|| {
                profile_issues.push(format!(
                    "Platform {} is not declared in [[platforms]].",
                    manifest_profile.platform
                ));
                configured_facet(
                    &manifest_profile.platform,
                    "platforms",
                    &manifest_profile.platform,
                )
            });
        let channel = channel_map
            .get(&manifest_profile.channel)
            .cloned()
            .unwrap_or_else(|| {
                profile_issues.push(format!(
                    "Channel {} is not declared in [[channels]].",
                    manifest_profile.channel
                ));
                configured_facet(
                    &manifest_profile.channel,
                    "channels",
                    &manifest_profile.channel,
                )
            });
        let bindings = manifest_profile.commands.unwrap_or_default();
        let check_command_id =
            resolve_command_reference(bindings.check.as_deref(), commands, &mut profile_issues);
        let build_command_id =
            resolve_command_reference(bindings.build.as_deref(), commands, &mut profile_issues);
        let run_command_id =
            resolve_command_reference(bindings.run.as_deref(), commands, &mut profile_issues);
        let artifacts = parse_artifact_paths(
            manifest_profile.artifacts.unwrap_or_default(),
            &manifest_profile.id,
            &mut profile_issues,
        );

        let label = manifest_profile
            .label
            .unwrap_or_else(|| format!("{} · {}", platform.label, channel.label));
        build_profiles.push(BuildProfile {
            id: manifest_profile.id,
            label,
            platform,
            channel,
            run_command_id,
            check_command_id,
            build_command_id,
            source: profile_source,
            region: manifest_profile.region,
            payment: manifest_profile.payment,
            artifacts,
            issues: profile_issues,
        });
    }

    for profile in &build_profiles {
        issues.extend(
            profile
                .issues
                .iter()
                .map(|issue| format!("{}: {issue}", profile.id)),
        );
    }
    if build_profiles.is_empty() {
        issues.push("No [[build_profiles]] entries are declared.".to_string());
    }

    ProjectConfigurationInspection {
        platforms,
        channels,
        build_profiles,
        cleanup,
        tools,
        links,
        manifest_status: ProjectConfigurationStatus::Configured,
        manifest_schema: Some(1),
        cleanup_issues,
        configuration: ProjectConfiguration {
            status: if issues.is_empty() {
                ProjectConfigurationStatus::Configured
            } else {
                ProjectConfigurationStatus::Invalid
            },
            manifest_path: MANIFEST_PATH.to_string(),
            issues,
        },
    }
}

pub fn build_protocol_status(
    inspection: &ProjectConfigurationInspection,
    icon: &IconConformance,
) -> ProtocolStatus {
    let manifest_status = inspection.manifest_status.clone();
    let manifest_issues = inspection.configuration.issues.clone();
    let manifest_is_valid = manifest_status == ProjectConfigurationStatus::Configured;

    let icon_capability = icon_capability(icon);
    let context_capability = if !manifest_is_valid {
        capability(
            "context",
            capability_status_for_manifest(&manifest_status),
            Vec::new(),
            manifest_issues.clone(),
        )
    } else {
        let status = match (
            inspection.platforms.is_empty(),
            inspection.channels.is_empty(),
        ) {
            (false, false) => ProtocolCapabilityStatus::Configured,
            (true, true) => ProtocolCapabilityStatus::Missing,
            _ => ProtocolCapabilityStatus::Partial,
        };
        let issues = match status {
            ProtocolCapabilityStatus::Configured => Vec::new(),
            ProtocolCapabilityStatus::Partial => vec![
                "Both [[platforms]] and [[channels]] are needed for a complete context."
                    .to_string(),
            ],
            _ => vec!["No platform or channel declarations were found.".to_string()],
        };
        capability(
            "context",
            status,
            vec![
                format!("{MANIFEST_PATH}#platforms"),
                format!("{MANIFEST_PATH}#channels"),
            ],
            issues,
        )
    };

    let build_capability = if !manifest_is_valid {
        capability(
            "build_profiles",
            capability_status_for_manifest(&manifest_status),
            Vec::new(),
            manifest_issues.clone(),
        )
    } else if inspection.build_profiles.is_empty() {
        capability(
            "build_profiles",
            ProtocolCapabilityStatus::Missing,
            vec![format!("{MANIFEST_PATH}#build_profiles")],
            vec!["No [[build_profiles]] entries are declared.".to_string()],
        )
    } else {
        let invalid_profiles = inspection
            .build_profiles
            .iter()
            .filter(|profile| !profile.issues.is_empty())
            .count();
        let status = if invalid_profiles == 0
            && inspection.configuration.status == ProjectConfigurationStatus::Configured
        {
            ProtocolCapabilityStatus::Configured
        } else if invalid_profiles < inspection.build_profiles.len() {
            ProtocolCapabilityStatus::Partial
        } else {
            ProtocolCapabilityStatus::Invalid
        };
        let issues = inspection
            .build_profiles
            .iter()
            .flat_map(|profile| {
                profile
                    .issues
                    .iter()
                    .map(move |issue| format!("{}: {issue}", profile.id))
            })
            .chain(
                (inspection.configuration.status == ProjectConfigurationStatus::Invalid
                    && invalid_profiles == 0)
                    .then(|| "The build configuration has additional manifest issues.".to_string()),
            )
            .collect();
        capability(
            "build_profiles",
            status,
            vec![format!("{MANIFEST_PATH}#build_profiles")],
            issues,
        )
    };

    let cleanup_capability = if !manifest_is_valid {
        capability(
            "cleanup",
            capability_status_for_manifest(&manifest_status),
            Vec::new(),
            manifest_issues,
        )
    } else if !inspection.cleanup_issues.is_empty() {
        capability(
            "cleanup",
            ProtocolCapabilityStatus::Invalid,
            vec![format!("{MANIFEST_PATH}#cleanup")],
            inspection.cleanup_issues.clone(),
        )
    } else if inspection.cleanup.cache.is_empty() && inspection.cleanup.build.is_empty() {
        capability(
            "cleanup",
            ProtocolCapabilityStatus::Missing,
            vec![format!("{MANIFEST_PATH}#cleanup")],
            vec!["No cleanup directories are declared.".to_string()],
        )
    } else {
        capability(
            "cleanup",
            ProtocolCapabilityStatus::Configured,
            vec![format!("{MANIFEST_PATH}#cleanup")],
            Vec::new(),
        )
    };

    ProtocolStatus {
        manifest_path: MANIFEST_PATH.to_string(),
        schema: inspection.manifest_schema,
        manifest_status,
        capabilities: vec![
            icon_capability,
            context_capability,
            build_capability,
            cleanup_capability,
        ],
    }
}

fn icon_capability(icon: &IconConformance) -> ProtocolCapability {
    let status = match icon.status {
        IconConformanceStatus::Compliant => ProtocolCapabilityStatus::Configured,
        IconConformanceStatus::Legacy => ProtocolCapabilityStatus::Legacy,
        IconConformanceStatus::Missing => ProtocolCapabilityStatus::Missing,
        IconConformanceStatus::Invalid => ProtocolCapabilityStatus::Invalid,
    };
    let issues = match icon.status {
        IconConformanceStatus::Compliant => Vec::new(),
        IconConformanceStatus::Legacy => {
            vec![
                "An icon was found by legacy detection but is not declared in the manifest."
                    .to_string(),
            ]
        }
        IconConformanceStatus::Missing => {
            vec!["The manifest does not declare a valid identity.icon path.".to_string()]
        }
        IconConformanceStatus::Invalid => {
            vec!["The declared icon does not satisfy the icon.v1 contract.".to_string()]
        }
    };
    let mut evidence = vec![icon.manifest_path.clone()];
    if let Some(resolved) = icon.resolved_icon.as_deref() {
        evidence.push(resolved.to_string());
    }
    capability("identity", status, evidence, issues)
}

fn capability_status_for_manifest(status: &ProjectConfigurationStatus) -> ProtocolCapabilityStatus {
    match status {
        ProjectConfigurationStatus::Configured => ProtocolCapabilityStatus::Configured,
        ProjectConfigurationStatus::Missing => ProtocolCapabilityStatus::Missing,
        ProjectConfigurationStatus::Invalid => ProtocolCapabilityStatus::Invalid,
    }
}

fn capability(
    id: &str,
    status: ProtocolCapabilityStatus,
    evidence: Vec<String>,
    issues: Vec<String>,
) -> ProtocolCapability {
    ProtocolCapability {
        id: id.to_string(),
        status,
        evidence,
        issues,
    }
}

pub fn write_project_configuration_report(
    project_path: &Path,
    project: &ProjectSnapshot,
) -> Result<ProjectConfigurationReport, String> {
    let root = project_path
        .canonicalize()
        .map_err(|error| format!("Cannot open project: {error}"))?;
    if !root.is_dir() {
        return Err("Project path is not a directory".to_string());
    }
    let report_path = root.join(CONFIGURATION_REPORT_PATH);
    let parent = report_path
        .parent()
        .ok_or_else(|| "Cannot determine report directory".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Cannot create report directory: {error}"))?;
    fs::write(&report_path, render_configuration_report(&root, project))
        .map_err(|error| format!("Cannot write project configuration report: {error}"))?;

    Ok(ProjectConfigurationReport {
        path: CONFIGURATION_REPORT_PATH.to_string(),
        status: project.configuration.status.clone(),
    })
}

pub fn write_project_guidance_reports(
    project_path: &Path,
    project: &ProjectSnapshot,
) -> Result<ProjectGuidanceReport, String> {
    let configuration_report = write_project_configuration_report(project_path, project)?;
    let icon_report = write_icon_conformance_report(project_path)?;

    Ok(ProjectGuidanceReport {
        paths: vec![configuration_report.path, icon_report.path],
        configuration_status: configuration_report.status,
        icon_status: icon_report.status,
    })
}

fn render_configuration_report(root: &Path, project: &ProjectSnapshot) -> String {
    let status = match &project.configuration.status {
        ProjectConfigurationStatus::Configured => "configured",
        ProjectConfigurationStatus::Missing => "missing",
        ProjectConfigurationStatus::Invalid => "invalid",
    };
    let mut report = format!(
        "# Atrium project configuration guidance\n\n- Project: `{}`\n- Status: `{status}`\n- Manifest: `{MANIFEST_PATH}`\n\n",
        root.display()
    );
    report.push_str(
        "Atrium reads platform, channel, and build-profile facts only from the structured manifest. This report is guidance for the project development Agent; Atrium never parses this Markdown file.\n\n",
    );
    report.push_str("## Required manifest shape\n\n```toml\nschema = 1\nprofile = \"<adapter-name>\"\n\n# Declare only platforms this project actually builds for.\n[[platforms]]\nid = \"<platform-id>\"\nlabel = \"<Platform label>\"\n\n# Declare the distribution channel for each supported build context.\n[[channels]]\nid = \"<channel-id>\"\nlabel = \"<Channel label>\"\n\n# Bind each platform/channel combination to existing repository commands.\n[[build_profiles]]\nid = \"<profile-id>\"\nlabel = \"<Platform> · <Channel>\"\nplatform = \"<platform-id>\"\nchannel = \"<channel-id>\"\n\n[build_profiles.commands]\nrun = \"<command-id-or-source>\"\ncheck = \"<command-id-or-source>\"\nbuild = \"<command-id-or-source>\"\n```\n\n");
    report.push_str("## Cleanup declarations\n\n");
    report.push_str(
        "Atrium cleans only directories explicitly declared by the project in the manifest. The project development Agent should add the cache and build output directories that are safe to regenerate:\n\n```toml\n[cleanup]\ncache = [\"<relative cache directory>\"]\nbuild = [\"<relative build directory>\"]\n```\n\n",
    );
    report.push_str("## Build artifact declarations\n\n");
    report.push_str(
        "Each build profile may declare files or directories it produces. Atrium only reports and opens these explicit paths; it does not infer artifacts from framework defaults:\n\n```toml\n[[build_profiles]]\n# ... profile fields ...\nartifacts = [\"<relative file or directory>\"]\n```\n\n",
    );
    report.push_str(
        "## Project tools and links\n\nThe optional `[tools]` section can name a terminal executable for this project. It is passed as a program path, never as a shell command. If it is absent or empty, Atrium uses the operating system's default terminal; users do not need to enter a command. Editor launchers are intentionally not part of the current protocol. Optional `[[links]]` entries are opened only after validating their declared URL scheme:\n\n```toml\n[tools]\nterminal = \"\"\n\n[[links]]\nid = \"preview\"\nlabel = \"Local preview\"\nurl = \"http://127.0.0.1:3000\"\nkind = \"preview\"\n```\n\n",
    );
    report.push_str("## Structured commands discovered by Atrium\n\n");
    if project.commands.is_empty() {
        report.push_str("- No supported repository command was discovered.\n");
    } else {
        for command in &project.commands {
            report.push_str(&format!(
                "- `{}` — `{}` (`{}`)\n",
                command.id, command.source, command.display_command
            ));
        }
    }
    report.push_str("\n## Current issues\n\n");
    if project.configuration.issues.is_empty() {
        report.push_str("- No configuration issue was reported.\n");
    } else {
        for issue in &project.configuration.issues {
            report.push_str(&format!("- {issue}\n"));
        }
    }
    report.push_str(
        "\nThe project development Agent should update `.atrium/manifest.toml` in the repository after verifying the native build scripts. Do not invent a new build command in Atrium.\n",
    );
    report
}

fn missing_configuration() -> ProjectConfigurationInspection {
    ProjectConfigurationInspection {
        platforms: Vec::new(),
        channels: Vec::new(),
        build_profiles: Vec::new(),
        cleanup: CleanupDeclaration::default(),
        tools: ProjectTools::default(),
        links: Vec::new(),
        manifest_status: ProjectConfigurationStatus::Missing,
        manifest_schema: None,
        cleanup_issues: Vec::new(),
        configuration: ProjectConfiguration {
            status: ProjectConfigurationStatus::Missing,
            manifest_path: MANIFEST_PATH.to_string(),
            issues: vec![format!("{MANIFEST_PATH} is not present.")],
        },
    }
}

fn invalid_configuration(
    issues: Vec<String>,
    manifest_schema: Option<u32>,
) -> ProjectConfigurationInspection {
    ProjectConfigurationInspection {
        platforms: Vec::new(),
        channels: Vec::new(),
        build_profiles: Vec::new(),
        cleanup: CleanupDeclaration::default(),
        tools: ProjectTools::default(),
        links: Vec::new(),
        manifest_status: ProjectConfigurationStatus::Invalid,
        manifest_schema,
        cleanup_issues: Vec::new(),
        configuration: ProjectConfiguration {
            status: ProjectConfigurationStatus::Invalid,
            manifest_path: MANIFEST_PATH.to_string(),
            issues,
        },
    }
}

fn parse_tools(declaration: Option<ManifestTools>) -> ProjectTools {
    let Some(declaration) = declaration else {
        return ProjectTools::default();
    };
    ProjectTools {
        terminal: normalize_optional_command(declaration.terminal),
    }
}

fn normalize_optional_command(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn parse_links(declarations: Vec<ManifestLink>, issues: &mut Vec<String>) -> Vec<ProjectLink> {
    let mut seen = HashSet::new();
    declarations
        .into_iter()
        .filter_map(|declaration| {
            let id = declaration.id.trim().to_string();
            let url = declaration.url.trim().to_string();
            if id.is_empty() || url.is_empty() {
                issues.push("A project link must declare a non-empty id and url.".to_string());
                return None;
            }
            if !seen.insert(id.clone()) {
                issues.push(format!("Duplicate project link id: {id}."));
                return None;
            }
            if !(url.starts_with("http://")
                || url.starts_with("https://")
                || url.starts_with("file://"))
            {
                issues.push(format!(
                    "Project link {id} must use http://, https://, or file://."
                ));
                return None;
            }
            Some(ProjectLink {
                id,
                label: declaration
                    .label
                    .filter(|label| !label.trim().is_empty())
                    .unwrap_or_else(|| "Link".to_string()),
                url,
                kind: declaration.kind,
            })
        })
        .collect()
}

fn parse_cleanup(
    declaration: Option<ManifestCleanup>,
    issues: &mut Vec<String>,
) -> CleanupDeclaration {
    let Some(declaration) = declaration else {
        return CleanupDeclaration::default();
    };

    let mut seen = HashSet::new();
    let cache = parse_cleanup_paths(
        declaration.cache.unwrap_or_default(),
        "cache",
        &mut seen,
        issues,
    );
    let build = parse_cleanup_paths(
        declaration.build.unwrap_or_default(),
        "build",
        &mut seen,
        issues,
    );

    CleanupDeclaration { cache, build }
}

fn parse_cleanup_paths(
    paths: Vec<String>,
    category: &str,
    seen: &mut HashSet<String>,
    issues: &mut Vec<String>,
) -> Vec<String> {
    paths
        .into_iter()
        .filter_map(|raw| {
            let normalized = raw.trim().replace('\\', "/");
            let invalid = normalized.is_empty()
                || normalized == "."
                || normalized.starts_with('/')
                || normalized.get(1..2) == Some(":")
                || normalized
                    .split('/')
                    .any(|part| part.is_empty() || part == "..");
            let protected = matches!(
                normalized.as_str(),
                ".git" | ".atrium" | "node_modules" | "vendor"
            );

            if invalid || protected {
                issues.push(format!(
                    "Cleanup {category} path must be a relative, non-protected directory: {raw}."
                ));
                return None;
            }
            if !seen.insert(normalized.clone()) {
                issues.push(format!("Duplicate cleanup directory: {normalized}."));
                return None;
            }
            Some(normalized)
        })
        .collect()
}

fn parse_artifact_paths(
    paths: Vec<String>,
    profile_id: &str,
    issues: &mut Vec<String>,
) -> Vec<String> {
    let mut seen = HashSet::new();
    paths
        .into_iter()
        .filter_map(|raw| {
            let normalized = raw.trim().replace('\\', "/");
            let invalid = normalized.is_empty()
                || normalized == "."
                || normalized.starts_with('/')
                || normalized.get(1..2) == Some(":")
                || normalized
                    .split('/')
                    .any(|part| part.is_empty() || part == "..");
            let protected = matches!(normalized.as_str(), ".git" | ".atrium");

            if invalid || protected {
                issues.push(format!(
                    "Build profile {profile_id} artifact path must be a relative, non-protected file or directory: {raw}."
                ));
                return None;
            }
            if !seen.insert(normalized.clone()) {
                issues.push(format!(
                    "Build profile {profile_id} declares duplicate artifact path: {normalized}."
                ));
                return None;
            }
            Some(normalized)
        })
        .collect()
}

fn build_facets(
    declarations: Vec<ManifestFacet>,
    section: &str,
    issues: &mut Vec<String>,
) -> Vec<Facet> {
    let mut seen = HashSet::new();
    declarations
        .into_iter()
        .filter_map(|declaration| {
            let id = declaration.id.trim().to_string();
            if id.is_empty() {
                issues.push(format!("A declaration in [[{section}]] is missing its id."));
                return None;
            }
            if !seen.insert(id.clone()) {
                issues.push(format!("Duplicate {section} id: {id}."));
                return None;
            }
            Some(configured_facet(
                &id,
                section,
                declaration.label.as_deref().unwrap_or(&id),
            ))
        })
        .collect()
}

fn facets_by_key(facets: &[Facet]) -> HashMap<String, Facet> {
    facets
        .iter()
        .map(|facet| (facet.key.clone(), facet.clone()))
        .collect()
}

fn configured_facet(id: &str, section: &str, label: &str) -> Facet {
    Facet {
        key: id.to_string(),
        label: if label.trim().is_empty() {
            humanize_id(id)
        } else {
            label.trim().to_string()
        },
        source: FacetSource::Configured,
        evidence: vec![format!("{MANIFEST_PATH}#{section}[{id}]")],
    }
}

fn resolve_command_reference(
    reference: Option<&str>,
    commands: &[ProjectCommand],
    issues: &mut Vec<String>,
) -> Option<String> {
    let reference = reference?.trim();
    if reference.is_empty() {
        return None;
    }
    if let Some(command) = commands
        .iter()
        .find(|command| command.id == reference || command.source == reference)
    {
        return Some(command.id.clone());
    }
    issues.push(format!("Command reference {reference} was not found."));
    None
}

fn humanize_id(value: &str) -> String {
    value
        .split(['-', '_'])
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::{build_protocol_status, scan_project_configuration};
    use crate::model::{
        CommandKind, IconConformance, IconConformanceStatus, ProjectCommand,
        ProjectConfigurationStatus, ProtocolCapabilityStatus,
    };
    use std::fs;

    fn command(id: &str, source: &str, kind: CommandKind) -> ProjectCommand {
        ProjectCommand {
            id: id.to_string(),
            kind,
            label: id.to_string(),
            program: "npm".to_string(),
            args: vec!["run".to_string(), id.to_string()],
            working_directory: "/tmp/project".to_string(),
            display_command: format!("npm run {id}"),
            source: source.to_string(),
        }
    }

    #[test]
    fn reads_explicit_platform_channel_and_profile_bindings() {
        let root = std::env::temp_dir().join(format!("atrium-manifest-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(".atrium")).expect("create manifest directory");
        fs::write(
            root.join(".atrium/manifest.toml"),
            r#"schema = 1

[[platforms]]
id = "macos"
label = "macOS"

[[channels]]
id = "apple-app-store"
label = "App Store"

[[build_profiles]]
id = "macos-app-store"
platform = "macos"
channel = "apple-app-store"
artifacts = ["dist/Atrium.dmg", "src-tauri/target/release/bundle/macos"]

[build_profiles.commands]
run = "package.json#scripts.dev"
build = "package.json#scripts.build:macos:appstore"

[cleanup]
cache = [".cache"]
build = ["dist"]
"#,
        )
        .expect("write manifest");
        let commands = vec![
            command("npm:dev", "package.json#scripts.dev", CommandKind::Run),
            command(
                "npm:build:macos:appstore",
                "package.json#scripts.build:macos:appstore",
                CommandKind::Other,
            ),
        ];

        let result = scan_project_configuration(&root, &commands);
        assert_eq!(
            result.configuration.status,
            ProjectConfigurationStatus::Configured
        );
        assert_eq!(result.platforms[0].key, "macos");
        assert_eq!(result.channels[0].key, "apple-app-store");
        assert_eq!(
            result.build_profiles[0].build_command_id.as_deref(),
            Some("npm:build:macos:appstore")
        );
        assert_eq!(
            result.build_profiles[0].run_command_id.as_deref(),
            Some("npm:dev")
        );
        assert_eq!(result.manifest_schema, Some(1));
        assert_eq!(result.cleanup.cache, vec![".cache"]);
        assert_eq!(result.cleanup.build, vec!["dist"]);
        assert_eq!(
            result.build_profiles[0].artifacts,
            vec![
                "dist/Atrium.dmg".to_string(),
                "src-tauri/target/release/bundle/macos".to_string()
            ]
        );

        let protocol = build_protocol_status(
            &result,
            &IconConformance {
                status: IconConformanceStatus::Compliant,
                manifest_path: ".atrium/manifest.toml".to_string(),
                report_path: ".atrium/reports/icon-conformance.md".to_string(),
                declared_icon: Some("icon.png".to_string()),
                resolved_icon: Some("icon.png".to_string()),
            },
        );
        assert_eq!(
            protocol.manifest_status,
            ProjectConfigurationStatus::Configured
        );
        assert_eq!(protocol.schema, Some(1));
        assert_eq!(
            protocol
                .capabilities
                .iter()
                .find(|capability| capability.id == "context")
                .expect("context capability")
                .status,
            ProtocolCapabilityStatus::Configured
        );
        assert_eq!(
            protocol
                .capabilities
                .iter()
                .find(|capability| capability.id == "cleanup")
                .expect("cleanup capability")
                .status,
            ProtocolCapabilityStatus::Configured
        );

        fs::remove_dir_all(root).expect("remove manifest directory");
    }

    #[test]
    fn missing_manifest_does_not_infer_any_platform_or_channel() {
        let root =
            std::env::temp_dir().join(format!("atrium-manifest-missing-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create project");

        let result = scan_project_configuration(&root, &[]);
        assert_eq!(
            result.configuration.status,
            ProjectConfigurationStatus::Missing
        );
        assert!(result.platforms.is_empty());
        assert!(result.channels.is_empty());
        assert!(result.build_profiles.is_empty());

        fs::remove_dir_all(root).expect("remove project");
    }

    #[test]
    fn manifest_without_build_profiles_is_not_executable_configuration() {
        let root = std::env::temp_dir().join(format!(
            "atrium-manifest-no-profiles-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(".atrium")).expect("create manifest directory");
        fs::write(
            root.join(".atrium/manifest.toml"),
            r#"schema = 1

[[platforms]]
id = "macos"
label = "macOS"

[[channels]]
id = "website"
label = "Website"
"#,
        )
        .expect("write manifest");

        let result = scan_project_configuration(&root, &[]);
        assert_eq!(
            result.configuration.status,
            ProjectConfigurationStatus::Invalid
        );
        assert!(result.build_profiles.is_empty());

        fs::remove_dir_all(root).expect("remove project");
    }
}
