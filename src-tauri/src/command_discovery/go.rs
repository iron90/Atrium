use std::path::Path;

use super::common::{command, executable};
use crate::model::{CommandKind, ProjectCommand};

pub(super) fn go_commands(path: &Path) -> Vec<ProjectCommand> {
    vec![
        command(
            "go:run",
            CommandKind::Run,
            "Run",
            executable("go"),
            vec!["run".to_string(), ".".to_string()],
            path,
            "go.mod",
            "go run .",
        ),
        command(
            "go:test",
            CommandKind::Check,
            "Check",
            executable("go"),
            vec!["test".to_string(), "./...".to_string()],
            path,
            "go.mod",
            "go test ./...",
        ),
        command(
            "go:build",
            CommandKind::Build,
            "Build",
            executable("go"),
            vec!["build".to_string(), "./...".to_string()],
            path,
            "go.mod",
            "go build ./...",
        ),
    ]
}
