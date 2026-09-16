use std::collections::HashSet;
use std::fs;
use std::path::Path;

use serde_json::Value;

use crate::model::{CommandKind, ProjectCommand};

pub fn discover_commands(path: &Path) -> Vec<ProjectCommand> {
    let mut commands = Vec::new();
    if let Some(package) = read_json(path, "package.json") {
        detect_package_commands(path, &package, &mut commands);
    }
    if commands.is_empty() && path.join("Cargo.toml").exists() {
        commands.extend([
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
        ]);
    }
    if commands.is_empty() && path.join("pubspec.yaml").exists() {
        commands.extend([
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
        ]);
    }
    detect_makefile_commands(path, &mut commands);
    if commands.is_empty() && path.join("run.command").is_file() && !cfg!(windows) {
        commands.push(command(
            "script:run.command",
            CommandKind::Run,
            "Run",
            executable("sh"),
            vec!["run.command".to_string()],
            path,
            "run.command",
            "sh run.command",
        ));
    }
    commands
}

fn detect_package_commands(path: &Path, package: &Value, commands: &mut Vec<ProjectCommand>) {
    let Some(scripts) = package.get("scripts").and_then(Value::as_object) else {
        return;
    };
    let manager = if path.join("pnpm-lock.yaml").exists() {
        "pnpm"
    } else if path.join("yarn.lock").exists() {
        "yarn"
    } else if path.join("bun.lockb").exists() || path.join("bun.lock").exists() {
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
            commands.push(package_command(path, manager, name, kind.clone()));
        }
    }
    for name in names {
        if !selected.contains(&name) && commands.len() < 18 {
            commands.push(package_command(path, manager, &name, CommandKind::Other));
        }
    }
}

fn package_command(path: &Path, manager: &str, script: &str, kind: CommandKind) -> ProjectCommand {
    let program = executable(manager);
    let args = match manager {
        "npm" | "yarn" | "pnpm" | "bun" => vec!["run".to_string(), script.to_string()],
        _ => vec!["run".to_string(), script.to_string()],
    };
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

fn detect_makefile_commands(path: &Path, commands: &mut Vec<ProjectCommand>) {
    let makefile = path.join("Makefile");
    let Ok(content) = fs::read_to_string(&makefile) else {
        return;
    };
    let mut targets = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('#') || line.starts_with('\t') || !trimmed.ends_with(':') {
            continue;
        }
        let target = trimmed.trim_end_matches(':').trim();
        if target.is_empty() || target.contains(' ') || target.contains('%') {
            continue;
        }
        targets.push(target.to_string());
    }
    for target in targets.into_iter().take(12) {
        let kind = if ["run", "dev", "start"].contains(&target.as_str()) {
            CommandKind::Run
        } else if ["check", "test", "lint"].contains(&target.as_str()) {
            CommandKind::Check
        } else if ["build", "package"].contains(&target.as_str()) {
            CommandKind::Build
        } else {
            CommandKind::Other
        };
        if commands
            .iter()
            .any(|existing| existing.id == format!("make:{target}"))
        {
            continue;
        }
        let label = command_label(&kind, &format!("make {target}"));
        commands.push(command(
            &format!("make:{target}"),
            kind,
            &label,
            executable("make"),
            vec![target.clone()],
            path,
            "Makefile",
            &format!("make {target}"),
        ));
    }
}

#[allow(clippy::too_many_arguments)]
fn command(
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

fn command_label(kind: &CommandKind, script: &str) -> String {
    match kind {
        CommandKind::Run => "Run".to_string(),
        CommandKind::Check => "Check".to_string(),
        CommandKind::Build => "Build".to_string(),
        CommandKind::Other => script.to_string(),
    }
}

fn executable(name: &str) -> String {
    if cfg!(windows) && ["npm", "pnpm", "yarn", "bun"].contains(&name) {
        format!("{name}.cmd")
    } else {
        name.to_string()
    }
}

fn read_json(path: &Path, file: &str) -> Option<Value> {
    let content = fs::read_to_string(path.join(file)).ok()?;
    serde_json::from_str(&content).ok()
}

#[cfg(test)]
mod tests {
    use super::{command_label, discover_commands};
    use crate::model::CommandKind;
    use std::fs;

    #[test]
    fn canonical_command_labels_do_not_expose_project_stage() {
        assert_eq!(command_label(&CommandKind::Run, "dev"), "Run");
        assert_eq!(command_label(&CommandKind::Check, "test"), "Check");
        assert_eq!(command_label(&CommandKind::Build, "build"), "Build");
    }

    #[test]
    fn discovers_preferred_package_scripts_before_other_scripts() {
        let root =
            std::env::temp_dir().join(format!("atrium-command-discovery-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create command fixture");
        fs::write(
            root.join("package.json"),
            r#"{"scripts":{"lint":"eslint .","build":"vite build","dev":"vite","docs":"vitepress dev"}}"#,
        )
        .expect("write package manifest");

        let commands = discover_commands(&root);

        assert_eq!(commands[0].id, "npm:dev");
        assert_eq!(commands[1].id, "npm:lint");
        assert_eq!(commands[2].id, "npm:build");
        assert_eq!(commands[3].id, "npm:docs");
        assert_eq!(commands[3].kind, CommandKind::Other);

        fs::remove_dir_all(root).expect("remove command fixture");
    }
}
