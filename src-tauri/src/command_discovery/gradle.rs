use std::path::Path;

use super::common::{command, has_project_file};
use crate::model::{CommandKind, ProjectCommand};

pub(super) fn gradle_commands(path: &Path) -> Vec<ProjectCommand> {
    let Some(source) = [
        "build.gradle",
        "build.gradle.kts",
        "settings.gradle",
        "settings.gradle.kts",
    ]
    .into_iter()
    .find(|file| has_project_file(path, file)) else {
        return Vec::new();
    };

    let uses_wrapper = has_project_file(path, "gradlew");
    let (program, prefix_args, display_tool) = if uses_wrapper {
        let (program, prefix_args) = wrapper_invocation();
        (program, prefix_args, "gradlew")
    } else {
        ("gradle".to_string(), Vec::new(), "gradle")
    };
    let with_task = |task: &str| {
        let mut args = prefix_args.clone();
        args.push(task.to_string());
        args
    };

    vec![
        command(
            "gradle:test",
            CommandKind::Check,
            "Check",
            program.clone(),
            with_task("test"),
            path,
            source,
            &format!("{display_tool} test"),
        ),
        command(
            "gradle:build",
            CommandKind::Build,
            "Build",
            program,
            with_task("build"),
            path,
            source,
            &format!("{display_tool} build"),
        ),
    ]
}

fn wrapper_invocation() -> (String, Vec<String>) {
    if cfg!(windows) {
        (
            "cmd".to_string(),
            vec!["/c".to_string(), "gradlew.bat".to_string()],
        )
    } else {
        ("sh".to_string(), vec!["gradlew".to_string()])
    }
}
