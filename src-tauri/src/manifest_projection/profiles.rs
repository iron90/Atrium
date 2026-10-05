use std::collections::{HashMap, HashSet};

use super::path_policy::normalize_declared_path;
use crate::conformance::MANIFEST_PATH;
use crate::manifest_schema::{
    ManifestBuildProfile, ManifestHostRequirements, ManifestVerificationBlocker,
};
use crate::model::{
    BlockedAction, BuildHostRequirements, BuildProfile, CommandKind, Facet, HostOs, ProjectCommand,
    VerificationBlocker,
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
        let verification =
            parse_host_requirements(manifest_profile.verification, &id, &mut profile_issues);
        validate_verification_hosts(&host_requirements, &verification, &id, &mut profile_issues);
        let verification_blockers = parse_verification_blockers(
            manifest_profile
                .verification_blockers
                .as_deref()
                .unwrap_or(&[]),
            &run_command_id,
            &check_command_id,
            &build_command_id,
            &host_requirements,
            &verification,
            &id,
            &mut profile_issues,
        );
        let artifacts = parse_artifact_paths(
            manifest_profile.artifacts.unwrap_or_default(),
            &id,
            &mut profile_issues,
        );

        let (platform, channel) = match (platform, channel) {
            (Some(platform), Some(channel)) => (platform, channel),
            _ => {
                issues.extend(
                    profile_issues
                        .into_iter()
                        .map(|issue| format!("{id}: {issue}")),
                );
                continue;
            }
        };

        let host_mismatch_actions = [
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
        let unverified_actions = [
            (CommandKind::Run, run_command_id.is_some()),
            (CommandKind::Check, check_command_id.is_some()),
            (CommandKind::Build, build_command_id.is_some()),
        ]
        .into_iter()
        .filter_map(|(action, is_bound)| {
            (is_bound
                && host_requirements.action_supported_for_platform(
                    &action,
                    &platform.key,
                    HostOs::current(),
                )
                && !verification.for_action(&action).is_some_and(|hosts| {
                    HostOs::current().is_some_and(|host| hosts.contains(&host))
                }))
            .then_some(action)
        })
        .collect();

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
            verification,
            host_mismatch_actions,
            unverified_actions,
            verification_blockers,
            blocked_actions: Vec::new(),
            source: profile_source,
            region: normalize_optional_text(manifest_profile.region),
            payment: normalize_optional_text(manifest_profile.payment),
            artifacts,
            issues: profile_issues,
        });
    }

    dedupe_verified_equivalents(&mut build_profiles, issues);

    build_profiles
}

// Verification attests "this exact command passed on this host"; a blocker
// attests "this exact command cannot complete on this host, for this recorded
// reason". Both facts follow the command: a host verified under one profile
// must not re-appear as pending verification under another, and a blocker
// declared under one profile applies to every identical binding. A command
// that is both verified and blocked on the same host is contradictory
// evidence; verification wins and the blocker is reported as an issue.
fn dedupe_verified_equivalents(build_profiles: &mut [BuildProfile], issues: &mut Vec<String>) {
    let Some(current_host) = HostOs::current() else {
        return;
    };
    let mut attested: HashSet<(String, CommandKind, HostOs)> = HashSet::new();
    let mut blocked: HashMap<(String, CommandKind, HostOs), String> = HashMap::new();
    for profile in build_profiles.iter() {
        for (action, command_id) in bound_actions(profile) {
            let Some(command_id) = command_id else {
                continue;
            };
            if let Some(hosts) = profile.verification.for_action(&action) {
                for host in hosts {
                    attested.insert((command_id.clone(), action, *host));
                }
            }
        }
        for blocker in &profile.verification_blockers {
            let Some(command_id) = profile.command_id_for_action(&blocker.action) else {
                continue;
            };
            let key = (command_id.to_string(), blocker.action, blocker.host);
            if attested.contains(&key) {
                issues.push(format!(
                    "Build profile {} declares a verification blocker for {} on host {}, but the same command is recorded as verified there; remove one of the conflicting records.",
                    profile.id,
                    action_label(blocker.action),
                    blocker.host.as_str()
                ));
                continue;
            }
            blocked.entry(key).or_insert_with(|| blocker.reason.clone());
        }
    }
    for profile in build_profiles.iter_mut() {
        let pending: Vec<CommandKind> = profile.unverified_actions.to_vec();
        let kept: Vec<CommandKind> = pending
            .into_iter()
            .filter(|action| match profile.command_id_for_action(action) {
                Some(command_id) => {
                    !attested.contains(&(command_id.to_string(), *action, current_host))
                }
                None => true,
            })
            .collect();
        profile.unverified_actions = kept;

        let blocked_actions = bound_actions(profile)
            .into_iter()
            .filter_map(|(action, command_id)| {
                let command_id = command_id?;
                let reason = blocked.get(&(command_id, action, current_host))?;
                Some(BlockedAction {
                    action,
                    reason: reason.clone(),
                })
            })
            .collect();
        profile.blocked_actions = blocked_actions;
    }
}

fn bound_actions(profile: &BuildProfile) -> [(CommandKind, Option<String>); 3] {
    [
        (CommandKind::Run, profile.run_command_id.clone()),
        (CommandKind::Check, profile.check_command_id.clone()),
        (CommandKind::Build, profile.build_command_id.clone()),
    ]
}

fn action_label(action: CommandKind) -> &'static str {
    match action {
        CommandKind::Run => "run",
        CommandKind::Check => "check",
        CommandKind::Build => "build",
        CommandKind::Other => "other",
    }
}

#[allow(clippy::too_many_arguments)]
fn parse_verification_blockers(
    declarations: &[ManifestVerificationBlocker],
    run_command_id: &Option<String>,
    check_command_id: &Option<String>,
    build_command_id: &Option<String>,
    host_requirements: &BuildHostRequirements,
    verification: &BuildHostRequirements,
    profile_id: &str,
    issues: &mut Vec<String>,
) -> Vec<VerificationBlocker> {
    let mut blockers = Vec::new();
    let mut seen = HashSet::new();
    for declaration in declarations {
        let action = match declaration.action.trim().to_ascii_lowercase().as_str() {
            "run" => CommandKind::Run,
            "check" => CommandKind::Check,
            "build" => CommandKind::Build,
            _ => {
                issues.push(format!(
                    "Build profile {profile_id} verification blocker uses unsupported action {}; expected run, check, or build.",
                    declaration.action
                ));
                continue;
            }
        };
        let command_bound = match action {
            CommandKind::Run => run_command_id.is_some(),
            CommandKind::Check => check_command_id.is_some(),
            CommandKind::Build => build_command_id.is_some(),
            CommandKind::Other => false,
        };
        if !command_bound {
            issues.push(format!(
                "Build profile {profile_id} declares a verification blocker for {}, which has no bound command.",
                action_label(action)
            ));
            continue;
        }
        let Some(host) = HostOs::parse(&declaration.host) else {
            issues.push(format!(
                "Build profile {profile_id} verification blocker for {} uses unsupported host OS {}; expected macos, windows, or linux.",
                action_label(action),
                declaration.host
            ));
            continue;
        };
        if let Some(required_hosts) = host_requirements.for_action(&action) {
            if !required_hosts.contains(&host) {
                issues.push(format!(
                    "Build profile {profile_id} verification blocker for {} includes host {}, which is not declared in host_requirements.",
                    action_label(action),
                    host.as_str()
                ));
                continue;
            }
        }
        let reason = declaration.reason.trim();
        if reason.is_empty() {
            issues.push(format!(
                "Build profile {profile_id} verification blocker for {} on host {} must include a non-empty reason.",
                action_label(action),
                host.as_str()
            ));
            continue;
        }
        if verification
            .for_action(&action)
            .is_some_and(|hosts| hosts.contains(&host))
        {
            issues.push(format!(
                "Build profile {profile_id} records both a verification and a verification blocker for {} on host {}; remove one of the conflicting records.",
                action_label(action),
                host.as_str()
            ));
            continue;
        }
        if !seen.insert((action, host)) {
            issues.push(format!(
                "Build profile {profile_id} declares a duplicate verification blocker for {} on host {}.",
                action_label(action),
                host.as_str()
            ));
            continue;
        }
        blockers.push(VerificationBlocker {
            action,
            host,
            reason: reason.to_string(),
        });
    }
    blockers
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

fn validate_verification_hosts(
    requirements: &BuildHostRequirements,
    verification: &BuildHostRequirements,
    profile_id: &str,
    issues: &mut Vec<String>,
) {
    for (action, label) in [
        (CommandKind::Run, "run"),
        (CommandKind::Check, "check"),
        (CommandKind::Build, "build"),
    ] {
        let Some(required_hosts) = requirements.for_action(&action) else {
            continue;
        };
        let Some(verified_hosts) = verification.for_action(&action) else {
            continue;
        };
        for host in verified_hosts {
            if !required_hosts.contains(host) {
                issues.push(format!(
                    "Build profile {profile_id} verification for {label} includes host {}, which is not declared in host_requirements.",
                    host.as_str()
                ));
            }
        }
    }
}

fn parse_host_list(
    values: Option<Vec<String>>,
    profile_id: &str,
    action: &str,
    issues: &mut Vec<String>,
) -> Option<Vec<HostOs>> {
    let values = values?;
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
) -> Option<Facet> {
    let id = id.trim();
    if let Some(facet) = facets.get(id) {
        return Some(facet.clone());
    }

    issues.push(format!("{kind} {id} is not declared in [[{section}]]."));
    None
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
