use std::path::Path;

use super::common::{command, has_project_file};
use crate::model::{CommandKind, ProjectCommand};

pub(super) fn maven_commands(path: &Path) -> Vec<ProjectCommand> {
    if !has_project_file(path, "pom.xml") {
        return Vec::new();
    }

    let uses_wrapper = has_project_file(path, "mvnw");
    let (program, prefix_args, display_tool) = if uses_wrapper {
        let (program, prefix_args) = wrapper_invocation();
        (program, prefix_args, "mvnw")
    } else {
        ("mvn".to_string(), Vec::new(), "mvn")
    };
    let with_goal = |goal: &str| {
        let mut args = prefix_args.clone();
        args.push(goal.to_string());
        args
    };

    vec![
        command(
            "maven:test",
            CommandKind::Check,
            "Check",
            program.clone(),
            with_goal("test"),
            path,
            "pom.xml",
            &format!("{display_tool} test"),
        ),
        command(
            "maven:build",
            CommandKind::Build,
            "Build",
            program,
            with_goal("package"),
            path,
            "pom.xml",
            &format!("{display_tool} package"),
        ),
    ]
}

fn wrapper_invocation() -> (String, Vec<String>) {
    if cfg!(windows) {
        (
            "cmd".to_string(),
            vec!["/c".to_string(), "mvnw.cmd".to_string()],
        )
    } else {
        ("sh".to_string(), vec!["mvnw".to_string()])
    }
}
