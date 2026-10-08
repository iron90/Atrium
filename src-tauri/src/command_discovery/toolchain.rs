use std::path::Path;

use super::common::{command, executable};
use crate::model::{CommandKind, ProjectCommand};

pub(super) fn cargo_commands(path: &Path) -> Vec<ProjectCommand> {
    vec![
        command(
            "cargo:test",
            CommandKind::Check,
            "Check",
            executable("cargo"),
            vec!["test".to_string()],
            path,
            "Cargo.toml",
            "cargo test",
        ),
        command(
            "cargo:build",
            CommandKind::Build,
            "Build",
            executable("cargo"),
            vec!["build".to_string()],
            path,
            "Cargo.toml",
            "cargo build",
        ),
        command(
            "cargo:run",
            CommandKind::Run,
            "Run",
            executable("cargo"),
            vec!["run".to_string()],
            path,
            "Cargo.toml",
            "cargo run",
        ),
    ]
}

pub(super) fn flutter_commands(path: &Path) -> Vec<ProjectCommand> {
    vec![
        command(
            "flutter:test",
            CommandKind::Check,
            "Check",
            executable("flutter"),
            vec!["test".to_string()],
            path,
            "pubspec.yaml",
            "flutter test",
        ),
        command(
            "flutter:build",
            CommandKind::Build,
            "Build",
            executable("flutter"),
            vec!["build".to_string()],
            path,
            "pubspec.yaml",
            "flutter build",
        ),
        command(
            "flutter:run",
            CommandKind::Run,
            "Run",
            executable("flutter"),
            vec!["run".to_string()],
            path,
            "pubspec.yaml",
            "flutter run",
        ),
    ]
}

pub(super) fn script_command(path: &Path) -> ProjectCommand {
    command(
        "script:run.command",
        CommandKind::Run,
        "Run",
        executable("sh"),
        vec!["run.command".to_string()],
        path,
        "run.command",
        "sh run.command",
    )
}
