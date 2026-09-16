mod common;
mod makefile;
mod package;
mod toolchain;

use std::path::Path;

use crate::model::ProjectCommand;

pub fn discover_commands(path: &Path) -> Vec<ProjectCommand> {
    let mut commands = Vec::new();
    if let Some(package) = package::read_package(path) {
        package::detect_commands(path, &package, &mut commands);
    }
    if commands.is_empty() && path.join("Cargo.toml").exists() {
        commands.extend(toolchain::cargo_commands(path));
    }
    if commands.is_empty() && path.join("pubspec.yaml").exists() {
        commands.extend(toolchain::flutter_commands(path));
    }
    makefile::detect_commands(path, &mut commands);
    if commands.is_empty() && path.join("run.command").is_file() && !cfg!(windows) {
        commands.push(toolchain::script_command(path));
    }
    commands
}

#[cfg(test)]
mod tests {
    use super::{common::command_label, discover_commands};
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
