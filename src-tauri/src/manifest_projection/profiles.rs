use std::collections::{HashMap, HashSet};

use super::facets::configured_facet;
use super::path_policy::normalize_declared_path;
use crate::conformance::MANIFEST_PATH;
use crate::manifest_schema::{ManifestBuildProfile, ManifestHostRequirements};
use crate::model::{
    BuildHostRequirements, BuildProfile, CommandKind, Facet, HostOs, ProjectCommand,
};

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
        let id = manifest_profile.id.trim().to_string();
        if id.is_empty() {
            issues.push("A build profile is missing its id.".to_string());
            continue;
        }
        if !profile_ids.insert(id.clone()) {
            issues.push(format!("Duplicate build profile id: {id}."));
            continue;
        }

        let profile_source = format!("{MANIFEST_PATH}#build_profiles.{id}");
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
        let host_requirements =
            parse_host_requirements(manifest_profile.host_requirements, &id, &mut profile_issues);
        let unsupported_actions = [
            (CommandKind::Run, run_command_id.is_some()),
            (CommandKind::Check, check_command_id.is_some()),
            (CommandKind::Build, build_command_id.is_some()),
        ]
        .into_iter()
        .filter_map(|(action, is_bound)| {
            (is_bound
                && !host_requirements.action_supported_for_platform(
                    &action,
                    &platform.key,
                    HostOs::current(),
                ))
            .then_some(action)
        })
        .collect();
        let artifacts = parse_artifact_paths(
            manifest_profile.artifacts.unwrap_or_default(),
            &id,
            &mut profile_issues,
        );

        let label = normalize_optional_text(manifest_profile.label)
            .unwrap_or_else(|| format!("{} · {}", platform.label, channel.label));
        build_profiles.push(BuildProfile {
            id,
            label,
            platform,
            channel,
            run_command_id,
            check_command_id,
            build_command_id,
            host_requirements,
            unsupported_actions,
            source: profile_source,
            region: normalize_optional_text(manifest_profile.region),
            payment: normalize_optional_text(manifest_profile.payment),
            artifacts,
            issues: profile_issues,
        });
    }

    build_profiles
}

fn parse_host_requirements(
    declaration: Option<ManifestHostRequirements>,
    profile_id: &str,
    issues: &mut Vec<String>,
) -> BuildHostRequirements {
    let Some(declaration) = declaration else {
        return BuildHostRequirements::default();
    };

    BuildHostRequirements {
        run: parse_host_list(declaration.run, profile_id, "run", issues),
        check: parse_host_list(declaration.check, profile_id, "check", issues),
        build: parse_host_list(declaration.build, profile_id, "build", issues),
    }
}

fn parse_host_list(
    values: Option<Vec<String>>,
    profile_id: &str,
    action: &str,
    issues: &mut Vec<String>,
) -> Option<Vec<HostOs>> {
    let Some(values) = values else {
        return None;
    };
    let mut seen = HashSet::new();
    let mut hosts = Vec::new();
    for raw in values {
        let normalized = raw.trim().to_ascii_lowercase();
        if normalized.is_empty() {
            issues.push(format!(
                "Build profile {profile_id} host requirement for {action} contains an empty host OS."
            ));
            continue;
        }
        let Some(host) = HostOs::parse(&normalized) else {
            issues.push(format!(
                "Build profile {profile_id} host requirement for {action} uses unsupported host OS {raw}; expected macos, windows, or linux."
            ));
            continue;
        };
        if !seen.insert(host) {
            issues.push(format!(
                "Build profile {profile_id} host requirement for {action} declares duplicate host OS: {normalized}."
            ));
            continue;
        }
        hosts.push(host);
    }
    if hosts.is_empty() {
        issues.push(format!(
            "Build profile {profile_id} host requirement for {action} must list at least one supported host OS."
        ));
    }
    Some(hosts)
}

fn resolve_facet(
    id: &str,
    facets: &HashMap<String, Facet>,
    kind: &str,
    section: &str,
    issues: &mut Vec<String>,
) -> Facet {
    let id = id.trim();
    if let Some(facet) = facets.get(id) {
        return facet.clone();
    }

    issues.push(format!("{kind} {id} is not declared in [[{section}]]."));
    configured_facet(id, section, id)
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
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
