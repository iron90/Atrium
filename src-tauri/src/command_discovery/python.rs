use std::path::Path;

use super::common::{command, has_project_file};
use crate::model::{CommandKind, ProjectCommand};
use crate::project_path::{project_entry_exists, read_project_text_file};

pub(super) fn python_commands(path: &Path) -> Vec<ProjectCommand> {
    let pyproject = Path::new("pyproject.toml");
    let (source, uses_uv, declares_build_system) =
        if project_entry_exists(path, pyproject).unwrap_or(false) {
            (
                "pyproject.toml",
                has_project_file(path, "uv.lock"),
                pyproject_declares_build_system(path),
            )
        } else if project_entry_exists(path, Path::new("requirements.txt")).unwrap_or(false) {
            ("requirements.txt", false, false)
        } else {
            return Vec::new();
        };

    let mut commands = vec![test_command(path, source, uses_uv)];
    if declares_build_system {
        commands.push(build_command(path, source, uses_uv));
    }
    commands
}

fn test_command(path: &Path, source: &str, uses_uv: bool) -> ProjectCommand {
    if uses_uv {
        command(
            "python:test",
            CommandKind::Check,
            "Check",
            "uv".to_string(),
            vec!["run".to_string(), "pytest".to_string()],
            path,
            source,
            "uv run pytest",
        )
    } else {
        let program = if cfg!(windows) { "python" } else { "python3" };
        command(
            "python:test",
            CommandKind::Check,
            "Check",
            program.to_string(),
            vec!["-m".to_string(), "pytest".to_string()],
            path,
            source,
            &format!("{program} -m pytest"),
        )
    }
}

fn build_command(path: &Path, source: &str, uses_uv: bool) -> ProjectCommand {
    if uses_uv {
        command(
            "python:build",
            CommandKind::Build,
            "Build",
            "uv".to_string(),
            vec!["build".to_string()],
            path,
            source,
            "uv build",
        )
    } else {
        let program = if cfg!(windows) { "python" } else { "python3" };
        command(
            "python:build",
            CommandKind::Build,
            "Build",
            program.to_string(),
            vec!["-m".to_string(), "build".to_string()],
            path,
            source,
            &format!("{program} -m build"),
        )
    }
}

fn pyproject_declares_build_system(path: &Path) -> bool {
    read_project_text_file(path, Path::new("pyproject.toml"))
        .ok()
        .flatten()
        .and_then(|content| toml::from_str::<toml::Value>(&content).ok())
        .is_some_and(|document| document.get("build-system").is_some())
}
