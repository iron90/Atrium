use std::path::Path;

use crate::model::{
    CommandKind, Facet, HostOs, ProjectCommand, ProjectConfigurationStatus, ProjectSnapshot,
};
use crate::scanner::scan_project;

const MAX_RUN_ID_LENGTH: usize = 128;

pub(crate) fn validate_run_id(run_id: &str) -> Result<(), String> {
    if run_id.is_empty()
        || run_id.len() > MAX_RUN_ID_LENGTH
        || run_id.contains(['/', '\\'])
        || run_id.chars().any(char::is_control)
    {
        return Err("Invalid run id".to_string());
    }
    Ok(())
}

pub(crate) struct ValidatedRun {
    pub(crate) project: ProjectSnapshot,
    pub(crate) command: ProjectCommand,
    pub(crate) profile_id: Option<String>,
    pub(crate) profile_action: Option<CommandKind>,
    pub(crate) platform: Option<Facet>,
    pub(crate) channel: Option<Facet>,
}

pub(crate) fn resolve_run_request(
    project_path: &str,
    command_id: &str,
    profile_id: Option<String>,
    profile_action: Option<CommandKind>,
) -> Result<ValidatedRun, String> {
    let project = scan_project(Path::new(project_path))
        .ok_or_else(|| "Project path cannot be scanned".to_string())?;
    let command = project
        .commands
        .iter()
        .find(|candidate| candidate.id == command_id)
        .cloned()
        .ok_or_else(|| "Command is not present in the scanned project".to_string())?;
    let (platform, channel) = resolve_profile(
        &project,
        &command,
        profile_id.as_deref(),
        profile_action.as_ref(),
    )?;

    Ok(ValidatedRun {
        project,
        command,
        profile_id,
        profile_action,
        platform,
        channel,
    })
}

fn resolve_profile(
    project: &ProjectSnapshot,
    command: &ProjectCommand,
    profile_id: Option<&str>,
    profile_action: Option<&CommandKind>,
) -> Result<(Option<Facet>, Option<Facet>), String> {
    let Some(profile_id) = profile_id else {
        return Ok((None, None));
    };

    if project.configuration.status != ProjectConfigurationStatus::Configured {
        return Err("Project configuration is not valid for profile execution".to_string());
    }
    let profile = project
        .build_profiles
        .iter()
        .find(|profile| profile.id == profile_id)
        .ok_or_else(|| "Build profile is not declared in the scanned project".to_string())?;
    let action = profile_action
        .ok_or_else(|| "A profile action is required for a profile command".to_string())?;
    if profile.command_id_for_action(action) != Some(command.id.as_str()) {
        return Err(format!(
            "Command {} is not bound to the {} action of build profile {}",
            command.id,
            format_command_kind(action),
            profile.id
        ));
    }
    if !profile.issues.is_empty() {
        return Err(format!(
            "Build profile {} is invalid: {}",
            profile.id,
            profile.issues.join(" ")
        ));
    }
    if !profile.action_supported_on_current_host(action) {
        if matches!(action, CommandKind::Run) {
            if let Some(target) = HostOs::parse(&profile.platform.key) {
                if HostOs::current() != Some(target) {
                    return Err(format!(
                        "Run for {} requires a matching {} host.",
                        profile.id,
                        target.as_str()
                    ));
                }
            }
        }
        let allowed_hosts = profile
            .host_requirements_for_action(action)
            .map(|hosts| {
                hosts
                    .iter()
                    .map(|host| host.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_else(|| "an unknown host".to_string());
        let current_host = HostOs::current()
            .map(HostOs::as_str)
            .unwrap_or(std::env::consts::OS);
        return Err(format!(
            "Build profile {} action {} is unavailable on the current host ({current_host}); required hosts: {allowed_hosts}.",
            profile.id,
            format_command_kind(action)
        ));
    }

    let verified_equivalently = project.build_profiles.iter().any(|candidate| {
        candidate.command_id_for_action(action) == Some(command.id.as_str())
            && candidate.action_verified_on_current_host(action)
    });
    if !profile.action_verified_on_current_host(action) && !verified_equivalently {
        let verified_hosts = profile
            .verification
            .for_action(action)
            .map(|hosts| {
                hosts
                    .iter()
                    .map(|host| host.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_else(|| "none".to_string());
        let current_host = HostOs::current()
            .map(HostOs::as_str)
            .unwrap_or(std::env::consts::OS);
        return Err(format!(
            "Build profile {} action {} has not been verified on the current host ({current_host}); verified hosts: {verified_hosts}.",
            profile.id,
            format_command_kind(action)
        ));
    }

    Ok((
        Some(profile.platform.clone()),
        Some(profile.channel.clone()),
    ))
}

fn format_command_kind(kind: &CommandKind) -> &'static str {
    match kind {
        CommandKind::Run => "run",
        CommandKind::Check => "check",
        CommandKind::Build => "build",
        CommandKind::Other => "other",
    }
}

#[cfg(test)]
mod tests {
    use super::{resolve_profile, validate_run_id};
    use crate::model::{
        BuildHostRequirements, BuildProfile, CleanupDeclaration, CommandKind, Facet, FacetSource,
        GuidanceStatus, HostOs, IconConformance, IconConformanceStatus, ProjectCommand,
        ProjectConfiguration, ProjectConfigurationStatus, ProjectSnapshot, ProjectTools,
        ProtocolStatus,
    };

    #[test]
    fn accepts_generated_run_id_shapes() {
        assert!(validate_run_id("demo-123").is_ok());
        assert!(validate_run_id("550e8400-e29b-41d4-a716-446655440000").is_ok());
    }

    #[test]
    fn rejects_run_ids_that_cannot_be_used_as_log_names() {
        assert!(validate_run_id("").is_err());
        assert!(validate_run_id("run/../log").is_err());
        assert!(validate_run_id("run\n1").is_err());
        assert!(validate_run_id(&"x".repeat(129)).is_err());
    }

    fn facet(key: &str) -> Facet {
        Facet {
            key: key.to_string(),
            label: key.to_string(),
            source: FacetSource::Configured,
            evidence: vec![],
        }
    }

    fn command(id: &str) -> ProjectCommand {
        ProjectCommand {
            id: id.to_string(),
            kind: CommandKind::Run,
            label: id.to_string(),
            program: "npm".to_string(),
            args: vec![],
            working_directory: ".".to_string(),
            display_command: format!("npm run {id}"),
            source: "package.json#scripts".to_string(),
        }
    }

    fn other_host() -> HostOs {
        match HostOs::current().expect("supported host") {
            HostOs::Macos => HostOs::Windows,
            HostOs::Windows => HostOs::Macos,
            HostOs::Linux => HostOs::Macos,
        }
    }

    fn profile(id: &str, run_command_id: Option<&str>) -> BuildProfile {
        let current = HostOs::current().expect("supported host");
        BuildProfile {
            id: id.to_string(),
            label: id.to_string(),
            platform: facet(current.as_str()),
            channel: facet("local"),
            run_command_id: run_command_id.map(str::to_string),
            check_command_id: None,
            build_command_id: None,
            host_requirements: BuildHostRequirements::default(),
            verification: BuildHostRequirements {
                run: Some(vec![current]),
                check: None,
                build: None,
            },
            host_mismatch_actions: vec![],
            unverified_actions: vec![],
            verification_blockers: vec![],
            blocked_actions: vec![],
            source: ".atrium/manifest.toml".to_string(),
            region: None,
            payment: None,
            artifacts: vec![],
            issues: vec![],
        }
    }

    fn project(status: ProjectConfigurationStatus, profiles: Vec<BuildProfile>) -> ProjectSnapshot {
        ProjectSnapshot {
            id: "demo".to_string(),
            name: "Demo".to_string(),
            path: "/tmp/demo".to_string(),
            modified_at: None,
            description: None,
            icon: None,
            icon_conformance: IconConformance {
                status: IconConformanceStatus::Missing,
                manifest_path: String::new(),
                declared_icon: None,
                resolved_icon: None,
            },
            protocol: ProtocolStatus {
                manifest_path: String::new(),
                schema: None,
                needs_update: false,
                manifest_status: ProjectConfigurationStatus::Missing,
                capabilities: vec![],
            },
            guidance: GuidanceStatus {
                revision: None,
                needs_update: false,
                needs_sync: false,
            },
            repo: None,
            tools: ProjectTools::default(),
            links: vec![],
            platforms: vec![],
            channels: vec![],
            build_profiles: profiles,
            configuration: ProjectConfiguration {
                status,
                manifest_path: ".atrium/manifest.toml".to_string(),
                issues: vec![],
            },
            commands: vec![],
            cleanup: CleanupDeclaration::default(),
            storage: None,
            artifacts: None,
            scanned_at: 0,
        }
    }

    fn configured_project(profiles: Vec<BuildProfile>) -> ProjectSnapshot {
        project(ProjectConfigurationStatus::Configured, profiles)
    }

    #[test]
    fn returns_no_profile_facets_without_profile_id() {
        let project = configured_project(vec![profile("macos-local", Some("run-dev"))]);

        let facets = resolve_profile(&project, &command("run-dev"), None, Some(&CommandKind::Run))
            .expect("plain commands skip profile resolution");

        assert!(facets.0.is_none());
        assert!(facets.1.is_none());
    }

    #[test]
    fn rejects_profile_execution_when_configuration_is_not_configured() {
        for status in [
            ProjectConfigurationStatus::Missing,
            ProjectConfigurationStatus::Invalid,
        ] {
            let project = project(status, vec![profile("macos-local", Some("run-dev"))]);

            let error = resolve_profile(
                &project,
                &command("run-dev"),
                Some("macos-local"),
                Some(&CommandKind::Run),
            )
            .expect_err("unconfigured projects cannot run profiles");

            assert_eq!(
                error,
                "Project configuration is not valid for profile execution"
            );
        }
    }

    #[test]
    fn rejects_build_profile_that_is_not_declared() {
        let project = configured_project(vec![profile("macos-local", Some("run-dev"))]);

        let error = resolve_profile(
            &project,
            &command("run-dev"),
            Some("windows-store"),
            Some(&CommandKind::Run),
        )
        .expect_err("unknown profiles are rejected");

        assert_eq!(
            error,
            "Build profile is not declared in the scanned project"
        );
    }

    #[test]
    fn requires_profile_action_for_profile_commands() {
        let project = configured_project(vec![profile("macos-local", Some("run-dev"))]);

        let error = resolve_profile(&project, &command("run-dev"), Some("macos-local"), None)
            .expect_err("profile commands need an action");

        assert_eq!(error, "A profile action is required for a profile command");
    }

    #[test]
    fn rejects_command_that_is_not_bound_to_the_profile_action() {
        let project = configured_project(vec![profile("macos-local", Some("other-command"))]);

        let error = resolve_profile(
            &project,
            &command("run-dev"),
            Some("macos-local"),
            Some(&CommandKind::Run),
        )
        .expect_err("unbound commands are rejected");

        assert_eq!(
            error,
            "Command run-dev is not bound to the run action of build profile macos-local"
        );
    }

    #[test]
    fn rejects_build_profile_that_has_issues() {
        let mut profile = profile("macos-local", Some("run-dev"));
        profile.issues = vec!["run command is missing".to_string()];
        let project = configured_project(vec![profile]);

        let error = resolve_profile(
            &project,
            &command("run-dev"),
            Some("macos-local"),
            Some(&CommandKind::Run),
        )
        .expect_err("invalid profiles are rejected");

        assert_eq!(
            error,
            "Build profile macos-local is invalid: run command is missing"
        );
    }

    #[test]
    fn accepts_check_verification_recorded_under_an_identical_binding() {
        let current = HostOs::current().expect("supported host");
        let mut verified = profile("a", Some("run-dev"));
        verified.check_command_id = Some("npm:quality".to_string());
        verified.verification.check = Some(vec![current]);
        let mut equivalent = profile("b", None);
        equivalent.check_command_id = Some("npm:quality".to_string());
        equivalent.verification.run = None;
        let mut project = configured_project(vec![verified, equivalent]);
        project.commands = vec![command("npm:quality")];

        // Profile b never recorded its own verification, but its check binds
        // the exact command profile a verified on this host.
        let (platform, channel) = resolve_profile(
            &project,
            &command("npm:quality"),
            Some("b"),
            Some(&CommandKind::Check),
        )
        .expect("identical command binding shares verification evidence");

        assert_eq!(platform.expect("platform facet").key, current.as_str());
        assert_eq!(channel.expect("channel facet").key, "local");
    }

    #[test]
    fn rejects_run_when_platform_requires_another_host() {
        let mut profile = profile("windows-local", Some("run-dev"));
        profile.platform = facet(other_host().as_str());
        let project = configured_project(vec![profile]);

        let error = resolve_profile(
            &project,
            &command("run-dev"),
            Some("windows-local"),
            Some(&CommandKind::Run),
        )
        .expect_err("cross-host run is rejected");

        assert_eq!(
            error,
            format!(
                "Run for windows-local requires a matching {} host.",
                other_host().as_str()
            )
        );
    }

    #[test]
    fn rejects_action_when_host_requirements_exclude_current_host() {
        let current = HostOs::current().expect("supported host");
        let mut profile = profile("macos-local", Some("run-dev"));
        profile.host_requirements = BuildHostRequirements {
            run: Some(vec![other_host()]),
            check: None,
            build: None,
        };
        let project = configured_project(vec![profile]);

        let error = resolve_profile(
            &project,
            &command("run-dev"),
            Some("macos-local"),
            Some(&CommandKind::Run),
        )
        .expect_err("host mismatch is rejected");

        assert_eq!(
            error,
            format!(
                "Build profile macos-local action run is unavailable on the current host ({}); required hosts: {}.",
                current.as_str(),
                other_host().as_str()
            )
        );
    }

    #[test]
    fn rejects_action_that_is_not_verified_on_current_host() {
        let current = HostOs::current().expect("supported host");
        let mut profile = profile("macos-local", Some("run-dev"));
        profile.verification = BuildHostRequirements {
            run: Some(vec![other_host()]),
            check: None,
            build: None,
        };
        let project = configured_project(vec![profile]);

        let error = resolve_profile(
            &project,
            &command("run-dev"),
            Some("macos-local"),
            Some(&CommandKind::Run),
        )
        .expect_err("unverified actions are rejected");

        assert_eq!(
            error,
            format!(
                "Build profile macos-local action run has not been verified on the current host ({}); verified hosts: {}.",
                current.as_str(),
                other_host().as_str()
            )
        );
    }

    #[test]
    fn resolves_platform_and_channel_for_verified_profile_on_current_host() {
        let current = HostOs::current().expect("supported host");
        let project = configured_project(vec![profile("macos-local", Some("run-dev"))]);

        let (platform, channel) = resolve_profile(
            &project,
            &command("run-dev"),
            Some("macos-local"),
            Some(&CommandKind::Run),
        )
        .expect("verified current-host profile resolves");

        assert_eq!(platform.expect("platform facet").key, current.as_str());
        assert_eq!(channel.expect("channel facet").key, "local");
    }
}
