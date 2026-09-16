use std::collections::{HashMap, HashSet};

use super::facets::configured_facet;
use super::path_policy::normalize_declared_path;
use crate::conformance::MANIFEST_PATH;
use crate::manifest_schema::ManifestBuildProfile;
use crate::model::{BuildProfile, Facet, ProjectCommand};

pub(super) fn parse_build_profiles(
    declarations: Vec<ManifestBuildProfile>,
    platform_map: &HashMap<String, Facet>,
    channel_map: &HashMap<String, Facet>,
    commands: &[ProjectCommand],
    issues: &mut Vec<String>,
) -> Vec<BuildProfile> {
    let mut profile_ids = HashSet::new();
    let mut build_profiles = Vec::new();

    for manifest_profile in declarations {
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
        let platform = resolve_facet(
            &manifest_profile.platform,
            platform_map,
            "Platform",
            "platforms",
            &mut profile_issues,
        );
        let channel = resolve_facet(
            &manifest_profile.channel,
            channel_map,
            "Channel",
            "channels",
            &mut profile_issues,
        );
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

    build_profiles
}

fn resolve_facet(
    id: &str,
    facets: &HashMap<String, Facet>,
    kind: &str,
    section: &str,
    issues: &mut Vec<String>,
) -> Facet {
    if let Some(facet) = facets.get(id) {
        return facet.clone();
    }

    issues.push(format!("{kind} {id} is not declared in [[{section}]]."));
    configured_facet(id, section, id)
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

fn parse_artifact_paths(
    paths: Vec<String>,
    profile_id: &str,
    issues: &mut Vec<String>,
) -> Vec<String> {
    let mut seen = HashSet::new();
    paths
        .into_iter()
        .filter_map(|raw| {
            let Some(normalized) = normalize_declared_path(&raw, &[".git", ".atrium"]) else {
                issues.push(format!(
                    "Build profile {profile_id} artifact path must be a relative, non-protected file or directory: {raw}."
                ));
                return None;
            };
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
