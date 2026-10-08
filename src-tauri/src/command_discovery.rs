mod common;
mod dotnet;
mod ecosystem;
mod elixir;
mod go;
mod gradle;
mod makefile;
mod maven;
mod package;
mod python;
mod toolchain;

use std::path::Path;

use crate::model::ProjectCommand;
use crate::project_path::project_entry_exists;

pub fn discover_commands(path: &Path) -> Vec<ProjectCommand> {
    let mut commands = ecosystem::detect(path);
    makefile::detect_commands(path, &mut commands);
    if commands.is_empty() && has_project_entry(path, "run.command") && !cfg!(windows) {
        commands.push(toolchain::script_command(path));
    }
    commands
}

fn has_project_entry(path: &Path, relative: &str) -> bool {
    project_entry_exists(path, Path::new(relative)).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::discover_commands;
    use crate::model::{CommandKind, ProjectCommand};
    use std::fs;

    fn fixture_root(name: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!(
            "atrium-command-discovery-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        root
    }

    fn command_with_id<'a>(commands: &'a [ProjectCommand], id: &str) -> &'a ProjectCommand {
        commands
            .iter()
            .find(|command| command.id == id)
            .unwrap_or_else(|| panic!("missing command {id} in {commands:?}"))
    }

    #[test]
    fn canonical_command_labels_do_not_expose_project_stage() {
        assert_eq!(
            super::common::command_label(&CommandKind::Run, "dev"),
            "Run"
        );
        assert_eq!(
            super::common::command_label(&CommandKind::Check, "test"),
            "Check"
        );
        assert_eq!(
            super::common::command_label(&CommandKind::Build, "build"),
            "Build"
        );
    }

    #[test]
    fn discovers_preferred_package_scripts_before_other_scripts() {
        let root = fixture_root("package");
        fs::create_dir_all(&root).expect("create command fixture");
        fs::write(
            root.join("package.json"),
            r#"{"scripts":{"lint":"eslint .","build":"vite build","dev":"vite","docs":"vitepress dev"}}"#,
        )
        .expect("write package manifest");

        let commands = discover_commands(&root);

        assert_eq!(commands[0].id, "npm:lint");
        assert_eq!(commands[1].id, "npm:build");
        assert_eq!(commands[2].id, "npm:dev");
        assert_eq!(commands[3].id, "npm:docs");
        assert_eq!(commands[3].kind, CommandKind::Other);

        fs::remove_dir_all(root).expect("remove command fixture");
    }

    #[test]
    fn ignores_script_names_that_cannot_be_represented_safely() {
        let root = fixture_root("safety");
        fs::create_dir_all(&root).expect("create command fixture");
        fs::write(
            root.join("package.json"),
            "{\"scripts\":{\"dev\":\"vite\",\"bad\\nname\":\"echo bad\",\"-unsafe\":\"echo unsafe\"}}",
        )
        .expect("write package manifest");

        let commands = discover_commands(&root);

        assert_eq!(commands.len(), 1);
        assert_eq!(commands[0].id, "npm:dev");
        assert!(commands
            .iter()
            .all(|command| !command.display_command.contains(['\n', '\r'])));

        fs::remove_dir_all(root).expect("remove command fixture");
    }

    #[test]
    fn ignores_make_targets_that_can_be_parsed_as_options() {
        let root = fixture_root("make");
        fs::create_dir_all(&root).expect("create command fixture");
        fs::write(root.join("Makefile"), "-unsafe:\nvalid-target:\n").expect("write makefile");

        let commands = discover_commands(&root);

        assert_eq!(commands.len(), 1);
        assert_eq!(commands[0].id, "make:valid-target");

        fs::remove_dir_all(root).expect("remove command fixture");
    }

    #[test]
    fn discovers_go_run_check_and_build_from_go_mod() {
        let root = fixture_root("go");
        fs::create_dir_all(&root).expect("create go fixture");
        fs::write(root.join("go.mod"), "module example.com/app\n\ngo 1.22\n")
            .expect("write go.mod");

        let commands = discover_commands(&root);

        assert_eq!(command_with_id(&commands, "go:run").kind, CommandKind::Run);
        assert_eq!(
            command_with_id(&commands, "go:run").display_command,
            "go run ."
        );
        assert_eq!(
            command_with_id(&commands, "go:test").kind,
            CommandKind::Check
        );
        assert_eq!(
            command_with_id(&commands, "go:build").kind,
            CommandKind::Build
        );
        assert!(commands
            .iter()
            .all(|command| command.source == "go.mod" && command.program == "go"));

        fs::remove_dir_all(root).expect("remove go fixture");
    }

    #[test]
    fn discovers_python_check_and_conditional_build() {
        let root = fixture_root("python-pyproject");
        fs::create_dir_all(&root).expect("create python fixture");
        fs::write(
            root.join("pyproject.toml"),
            "[project]\nname = \"app\"\n\n[build-system]\nrequires = [\"setuptools\"]\n",
        )
        .expect("write pyproject.toml");

        let commands = discover_commands(&root);

        assert_eq!(
            command_with_id(&commands, "python:test").kind,
            CommandKind::Check
        );
        assert!(commands
            .iter()
            .all(|command| command.kind != CommandKind::Run));
        let expected_test_program = if cfg!(windows) { "python" } else { "python3" };
        let build = command_with_id(&commands, "python:build");
        assert_eq!(build.kind, CommandKind::Build);
        assert_eq!(build.program, expected_test_program);
        assert_eq!(build.source, "pyproject.toml");

        fs::remove_dir_all(root).expect("remove python fixture");
    }

    #[test]
    fn uv_lock_project_routes_python_commands_through_uv() {
        let root = fixture_root("python-uv");
        fs::create_dir_all(&root).expect("create python fixture");
        fs::write(
            root.join("pyproject.toml"),
            "[project]\nname = \"app\"\n\n[build-system]\nrequires = [\"hatchling\"]\n",
        )
        .expect("write pyproject.toml");
        fs::write(root.join("uv.lock"), "").expect("write uv.lock");

        let commands = discover_commands(&root);

        let test = command_with_id(&commands, "python:test");
        assert_eq!(test.program, "uv");
        assert_eq!(test.display_command, "uv run pytest");
        assert_eq!(
            command_with_id(&commands, "python:build").display_command,
            "uv build"
        );

        fs::remove_dir_all(root).expect("remove python fixture");
    }

    #[test]
    fn requirements_txt_project_discovers_only_the_check_command() {
        let root = fixture_root("python-requirements");
        fs::create_dir_all(&root).expect("create python fixture");
        fs::write(root.join("requirements.txt"), "pytest\n").expect("write requirements.txt");

        let commands = discover_commands(&root);

        assert_eq!(commands.len(), 1);
        assert_eq!(commands[0].id, "python:test");
        assert_eq!(commands[0].source, "requirements.txt");

        fs::remove_dir_all(root).expect("remove python fixture");
    }

    #[test]
    fn discovers_gradle_tasks_and_prefers_the_wrapper_when_present() {
        let root = fixture_root("gradle-wrapper");
        fs::create_dir_all(&root).expect("create gradle fixture");
        fs::write(
            root.join("settings.gradle.kts"),
            "rootProject.name = \"app\"\n",
        )
        .expect("write settings.gradle.kts");
        fs::write(root.join("gradlew"), "#!/bin/sh\necho wrapper\n").expect("write gradlew");

        let commands = discover_commands(&root);

        assert_eq!(
            command_with_id(&commands, "gradle:test").kind,
            CommandKind::Check
        );
        assert_eq!(
            command_with_id(&commands, "gradle:build").kind,
            CommandKind::Build
        );
        assert!(commands
            .iter()
            .all(|command| command.kind != CommandKind::Run));

        fs::remove_dir_all(root).expect("remove gradle fixture");
    }

    #[test]
    fn falls_back_to_path_gradle_without_a_wrapper() {
        let root = fixture_root("gradle-path");
        fs::create_dir_all(&root).expect("create gradle fixture");
        fs::write(root.join("build.gradle"), "// gradle build\n").expect("write build.gradle");

        let commands = discover_commands(&root);

        assert_eq!(command_with_id(&commands, "gradle:test").program, "gradle");
        assert_eq!(
            command_with_id(&commands, "gradle:test").source,
            "build.gradle"
        );

        fs::remove_dir_all(root).expect("remove gradle fixture");
    }

    #[test]
    fn discovers_maven_goals_from_pom_xml() {
        let root = fixture_root("maven");
        fs::create_dir_all(&root).expect("create maven fixture");
        fs::write(root.join("pom.xml"), "<project/>").expect("write pom.xml");

        let commands = discover_commands(&root);

        assert_eq!(
            command_with_id(&commands, "maven:test").kind,
            CommandKind::Check
        );
        assert_eq!(
            command_with_id(&commands, "maven:test").display_command,
            "mvn test"
        );
        assert_eq!(
            command_with_id(&commands, "maven:build").display_command,
            "mvn package"
        );

        fs::remove_dir_all(root).expect("remove maven fixture");
    }

    #[test]
    fn discovers_dotnet_commands_from_a_root_project_file() {
        let root = fixture_root("dotnet");
        fs::create_dir_all(&root).expect("create dotnet fixture");
        fs::write(
            root.join("App.csproj"),
            "<Project Sdk=\"Microsoft.NET.Sdk\" />",
        )
        .expect("write csproj");

        let commands = discover_commands(&root);

        assert_eq!(
            command_with_id(&commands, "dotnet:run").kind,
            CommandKind::Run
        );
        assert_eq!(
            command_with_id(&commands, "dotnet:test").kind,
            CommandKind::Check
        );
        assert_eq!(
            command_with_id(&commands, "dotnet:build").kind,
            CommandKind::Build
        );
        assert!(commands
            .iter()
            .all(|command| command.source == "App.csproj" && command.program == "dotnet"));

        fs::remove_dir_all(root).expect("remove dotnet fixture");
    }

    #[test]
    fn discovers_the_elixir_check_command_from_mix_exs() {
        let root = fixture_root("elixir");
        fs::create_dir_all(&root).expect("create elixir fixture");
        fs::write(root.join("mix.exs"), "defmodule App.MixProject do\nend\n")
            .expect("write mix.exs");

        let commands = discover_commands(&root);

        assert_eq!(commands.len(), 1);
        assert_eq!(commands[0].id, "elixir:test");
        assert_eq!(commands[0].kind, CommandKind::Check);

        fs::remove_dir_all(root).expect("remove elixir fixture");
    }

    #[test]
    fn package_json_takes_precedence_over_later_ecosystems() {
        let root = fixture_root("precedence");
        fs::create_dir_all(&root).expect("create precedence fixture");
        fs::write(root.join("package.json"), r#"{"scripts":{"dev":"vite"}}"#)
            .expect("write package.json");
        fs::write(root.join("go.mod"), "module example.com/app\n").expect("write go.mod");
        fs::write(root.join("pom.xml"), "<project/>").expect("write pom.xml");

        let commands = discover_commands(&root);

        assert_eq!(commands[0].id, "npm:dev");
        assert!(commands
            .iter()
            .all(|command| command.id.starts_with("npm:")));

        fs::remove_dir_all(root).expect("remove precedence fixture");
    }
}
