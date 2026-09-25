use std::path::Path;

use super::common::has_project_file;
use crate::model::ProjectCommand;

pub(super) struct Ecosystem {
    pub(super) marker_files: &'static [&'static str],
    pub(super) detect_commands: fn(&Path) -> Vec<ProjectCommand>,
}

// The first ecosystem whose markers are present and whose detector yields
// commands wins. An empty marker list means the detector decides marker
// presence itself and must return an empty Vec to fall through.
pub(super) const ECOSYSTEMS: &[Ecosystem] = &[
    Ecosystem {
        marker_files: &["package.json"],
        detect_commands: super::package::node_commands,
    },
    Ecosystem {
        marker_files: &["Cargo.toml"],
        detect_commands: super::toolchain::cargo_commands,
    },
    Ecosystem {
        marker_files: &["pubspec.yaml"],
        detect_commands: super::toolchain::flutter_commands,
    },
    Ecosystem {
        marker_files: &["go.mod"],
        detect_commands: super::go::go_commands,
    },
    Ecosystem {
        marker_files: &["pyproject.toml", "requirements.txt"],
        detect_commands: super::python::python_commands,
    },
    Ecosystem {
        marker_files: &[
            "build.gradle",
            "build.gradle.kts",
            "settings.gradle",
            "settings.gradle.kts",
        ],
        detect_commands: super::gradle::gradle_commands,
    },
    Ecosystem {
        marker_files: &["pom.xml"],
        detect_commands: super::maven::maven_commands,
    },
    Ecosystem {
        marker_files: &[],
        detect_commands: super::dotnet::dotnet_commands,
    },
    Ecosystem {
        marker_files: &["mix.exs"],
        detect_commands: super::elixir::elixir_commands,
    },
];

pub(super) fn detect(path: &Path) -> Vec<ProjectCommand> {
    for ecosystem in ECOSYSTEMS {
        if !ecosystem.matches(path) {
            continue;
        }
        let commands = (ecosystem.detect_commands)(path);
        if !commands.is_empty() {
            return commands;
        }
    }
    Vec::new()
}

impl Ecosystem {
    fn matches(&self, path: &Path) -> bool {
        self.marker_files.is_empty()
            || self
                .marker_files
                .iter()
                .any(|file| has_project_file(path, file))
    }
}
