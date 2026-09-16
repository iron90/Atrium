use std::collections::{HashMap, HashSet};

use crate::conformance::MANIFEST_PATH;
use crate::manifest::ProjectConfigurationInspection;
use crate::manifest_schema::{
    ManifestCleanup, ManifestDocument, ManifestFacet, ManifestLink, ManifestTools,
};
use crate::model::{
    BuildProfile, CleanupDeclaration, Facet, FacetSource, ProjectCommand, ProjectConfiguration,
    ProjectConfigurationStatus, ProjectLink, ProjectTools,
};

pub(crate) fn project(
    document: ManifestDocument,
    commands: &[ProjectCommand],
) -> ProjectConfigurationInspection {
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
