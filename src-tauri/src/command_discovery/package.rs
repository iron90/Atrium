use std::collections::HashSet;
use std::path::Path;

use serde_json::Value;

use super::common::{command, command_label, executable, has_project_file, is_safe_command_name};
use crate::model::{CommandKind, ProjectCommand};
use crate::project_path::read_project_text_file;

pub(super) fn node_commands(path: &Path) -> Vec<ProjectCommand> {
    let Some(package) = read_package(path) else {
        return Vec::new();
    };
    let mut commands = Vec::new();
    detect_commands(path, &package, &mut commands);
    commands
}

pub(super) fn read_package(path: &Path) -> Option<Value> {
    let content = read_project_text_file(path, Path::new("package.json")).ok()??;
    serde_json::from_str(&content).ok()
}

pub(super) fn detect_commands(path: &Path, package: &Value, commands: &mut Vec<ProjectCommand>) {
    let Some(scripts) = package.get("scripts").and_then(Value::as_object) else {
        return;
    };
    let manager = if has_project_file(path, "pnpm-lock.yaml") {
        "pnpm"
    } else if has_project_file(path, "yarn.lock") {
        "yarn"
    } else if has_project_file(path, "bun.lockb") || has_project_file(path, "bun.lock") {
        "bun"
    } else {
        "npm"
    };
    let mut names = scripts.keys().cloned().collect::<Vec<_>>();
    names.sort();
    let preferred: &[(CommandKind, &[&str])] = &[
        (CommandKind::Run, &["dev", "start", "run", "preview"]),
        (CommandKind::Check, &["check", "test", "typecheck", "lint"]),
        (CommandKind::Build, &["build", "package"]),
    ];
    let mut selected = HashSet::new();
    for (kind, candidates) in preferred {
        if let Some(name) = candidates
            .iter()
            .find(|candidate| scripts.contains_key(**candidate))
        {
            selected.insert((*name).to_string());
            commands.push(package_command(path, manager, name, *kind));
        }
    }
    for name in names {
        if !is_safe_command_name(&name) {
            continue;
        }
        if !selected.contains(&name) && commands.len() < 18 {
            commands.push(package_command(path, manager, &name, CommandKind::Other));
        }
    }
}

fn package_command(path: &Path, manager: &str, script: &str, kind: CommandKind) -> ProjectCommand {
    let program = executable(manager);
    let args = vec!["run".to_string(), script.to_string()];
    let display = format!("{manager} run {script}");
    let label = command_label(&kind, script);
    let source = format!("package.json#scripts.{script}");
    command(
        &format!("{manager}:{script}"),
        kind,
        &label,
        program,
        args,
        path,
        &source,
        &display,
    )
}
