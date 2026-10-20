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
    let manager = detect_manager(path);
    if let Some(install) = frozen_install_command(path, manager) {
        commands.push(install);
    }
    let mut names = scripts.keys().cloned().collect::<Vec<_>>();
    names.sort();
    // Canonical commands follow the workflow order: check, build, run.
    let preferred: &[(CommandKind, &[&str])] = &[
        (CommandKind::Check, &["check", "test", "typecheck", "lint"]),
        (CommandKind::Build, &["build", "package"]),
        (CommandKind::Run, &["dev", "start", "run", "preview"]),
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
        // Install is an action rather than a general-purpose command, so the
        // list limit applies only to the commands that follow it.
        let script_count = commands
            .iter()
            .filter(|command| command.kind != CommandKind::Install)
            .count();
        if !selected.contains(&name) && script_count < 18 {
            commands.push(package_command(path, manager, &name, CommandKind::Other));
        }
    }
}

fn detect_manager(path: &Path) -> &'static str {
    if has_project_file(path, "pnpm-lock.yaml") {
        "pnpm"
    } else if has_project_file(path, "yarn.lock") {
        "yarn"
    } else if has_project_file(path, "bun.lockb") || has_project_file(path, "bun.lock") {
        "bun"
    } else {
        "npm"
    }
}

struct FrozenInstall {
    lockfile: &'static str,
    args: &'static [&'static str],
}

/// A lockfile is the structured fact that a frozen restore exists. The command
/// is emitted as program + args; it is never assembled from manifest text.
fn frozen_install_command(path: &Path, manager: &str) -> Option<ProjectCommand> {
    let install = match manager {
        "pnpm" if has_project_file(path, "pnpm-lock.yaml") => FrozenInstall {
            lockfile: "pnpm-lock.yaml",
            args: &["install", "--frozen-lockfile"],
        },
        "yarn" if has_project_file(path, "yarn.lock") => FrozenInstall {
            lockfile: "yarn.lock",
            args: if has_project_file(path, ".yarnrc.yml") {
                &["install", "--immutable"]
            } else {
                &["install", "--frozen-lockfile"]
            },
        },
        "bun" if has_project_file(path, "bun.lockb") => FrozenInstall {
            lockfile: "bun.lockb",
            args: &["install", "--frozen-lockfile"],
        },
        "bun" if has_project_file(path, "bun.lock") => FrozenInstall {
            lockfile: "bun.lock",
            args: &["install", "--frozen-lockfile"],
        },
        _ if has_project_file(path, "package-lock.json") => FrozenInstall {
            lockfile: "package-lock.json",
            args: &["ci"],
        },
        _ if has_project_file(path, "npm-shrinkwrap.json") => FrozenInstall {
            lockfile: "npm-shrinkwrap.json",
            args: &["ci"],
        },
        _ => return None,
    };

    let id = if manager == "npm" {
        "npm:ci".to_string()
    } else {
        format!("{manager}:install")
    };
    let display = std::iter::once(manager)
        .chain(install.args.iter().copied())
        .collect::<Vec<_>>()
        .join(" ");
    Some(command(
        &id,
        CommandKind::Install,
        "Install",
        executable(manager),
        install
            .args
            .iter()
            .map(|argument| argument.to_string())
            .collect(),
        path,
        install.lockfile,
        &display,
    ))
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
