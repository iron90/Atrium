use std::path::Path;

use crate::model::{CommandKind, ProjectCommand};

pub(super) const MAX_COMMAND_NAME_BYTES: usize = 128;

#[allow(clippy::too_many_arguments)]
pub(super) fn command(
    id: &str,
    kind: CommandKind,
    label: &str,
    program: String,
    args: Vec<String>,
    path: &Path,
    source: &str,
    display_command: &str,
) -> ProjectCommand {
    ProjectCommand {
        id: id.to_string(),
        kind,
        label: label.to_string(),
        program,
        args,
        working_directory: path.to_string_lossy().to_string(),
        display_command: display_command.to_string(),
        source: source.to_string(),
    }
}

pub(super) fn command_label(kind: &CommandKind, script: &str) -> String {
    match kind {
        CommandKind::Run => "Run".to_string(),
        CommandKind::Check => "Check".to_string(),
        CommandKind::Build => "Build".to_string(),
        CommandKind::Other => script.to_string(),
    }
}

pub(super) fn executable(name: &str) -> String {
    if cfg!(windows) && ["npm", "pnpm", "yarn", "bun"].contains(&name) {
        format!("{name}.cmd")
    } else {
        name.to_string()
    }
}

pub(super) fn is_safe_command_name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_COMMAND_NAME_BYTES
        && !value.starts_with('-')
        && value
            .chars()
            .all(|character| !character.is_whitespace() && !character.is_control())
}
