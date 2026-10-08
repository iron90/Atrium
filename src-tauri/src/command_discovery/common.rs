use std::fs;
use std::path::Path;

use crate::model::{CommandKind, ProjectCommand};
use crate::project_path::canonical_project_root;

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
        CommandKind::Check => "Check".to_string(),
        CommandKind::Build => "Build".to_string(),
        CommandKind::Run => "Run".to_string(),
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

pub(super) fn has_project_file(path: &Path, relative: &str) -> bool {
    crate::project_path::project_entry_exists(path, Path::new(relative)).unwrap_or(false)
}

pub(super) fn is_safe_command_name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_COMMAND_NAME_BYTES
        && !value.starts_with('-')
        && value
            .chars()
            .all(|character| !character.is_whitespace() && !character.is_control())
}

// Non-recursive by design: discovery facts must come from the project root so
// scans stay deterministic and cannot be widened through nested directories.
pub(super) fn find_root_file_by_extension(path: &Path, extensions: &[&str]) -> Option<String> {
    let root = canonical_project_root(path).ok()?;
    let mut names: Vec<String> = fs::read_dir(root)
        .ok()?
        .flatten()
        .filter(|entry| {
            entry
                .file_type()
                .map(|kind| kind.is_file())
                .unwrap_or(false)
        })
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            let extension = Path::new(&name)
                .extension()?
                .to_string_lossy()
                .to_ascii_lowercase();
            extensions.contains(&extension.as_str()).then_some(name)
        })
        .collect();
    names.sort();
    names.into_iter().next()
}
