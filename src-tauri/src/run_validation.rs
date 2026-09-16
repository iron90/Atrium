use std::path::Path;

use crate::model::{
    CommandKind, Facet, ProjectCommand, ProjectConfigurationStatus, ProjectSnapshot,
};
use crate::scanner::scan_project;

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
