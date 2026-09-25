use std::path::Path;

use super::common::{command, find_root_file_by_extension};
use crate::model::{CommandKind, ProjectCommand};

pub(super) fn dotnet_commands(path: &Path) -> Vec<ProjectCommand> {
    let Some(source) = find_root_file_by_extension(path, &["csproj", "fsproj", "vbproj", "sln"])
    else {
        return Vec::new();
    };

    vec![
        command(
            "dotnet:run",
            CommandKind::Run,
            "Run",
            "dotnet".to_string(),
            vec!["run".to_string()],
            path,
            &source,
            "dotnet run",
        ),
        command(
            "dotnet:test",
            CommandKind::Check,
            "Check",
            "dotnet".to_string(),
            vec!["test".to_string()],
            path,
            &source,
            "dotnet test",
        ),
        command(
            "dotnet:build",
            CommandKind::Build,
            "Build",
            "dotnet".to_string(),
            vec!["build".to_string()],
            path,
            &source,
            "dotnet build",
        ),
    ]
}
