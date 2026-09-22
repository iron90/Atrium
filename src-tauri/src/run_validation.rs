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

    if !profile.action_verified_on_current_host(action) {
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
    use super::validate_run_id;

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
}
