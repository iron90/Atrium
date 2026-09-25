use std::path::Path;

use super::common::{command, has_project_file};
use crate::model::{CommandKind, ProjectCommand};

pub(super) fn elixir_commands(path: &Path) -> Vec<ProjectCommand> {
    if !has_project_file(path, "mix.exs") {
        return Vec::new();
    }

    vec![command(
        "elixir:test",
        CommandKind::Check,
        "Check",
        "mix".to_string(),
        vec!["test".to_string()],
        path,
        "mix.exs",
        "mix test",
    )]
}
