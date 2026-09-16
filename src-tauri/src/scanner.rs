use std::fs;
use std::path::Path;

use serde_json::Value;

use crate::artifacts::inspect_project_artifacts;
use crate::command_discovery::discover_commands;
use crate::conformance::inspect_icon;
use crate::git::read_git_snapshot;
use crate::manifest::{build_protocol_status, scan_project_configuration};
use crate::model::{ProjectSnapshot, WorkspaceSnapshot};
use crate::storage::inspect_project_storage;
use crate::time::now_millis;

const IGNORED_DIRECTORIES: &[&str] = &[
    ".git",
    ".idea",
    ".vscode",
    "node_modules",
    "target",
    "dist",
    "build",
    "Library",
    "Temp",
    ".venv",
    "vendor",
];
#[allow(dead_code)]
pub fn scan_workspace(root_path: &Path) -> Result<WorkspaceSnapshot, String> {
    scan_workspace_with_exclusions(root_path, &[])
}

pub fn scan_workspace_with_exclusions(
    root_path: &Path,
    excluded_names: &[String],
) -> Result<WorkspaceSnapshot, String> {
    let root = root_path
        .canonicalize()
        .map_err(|error| format!("Cannot open workspace: {error}"))?;
    if !root.is_dir() {
        return Err("Workspace path is not a directory".to_string());
    }

    let mut entries = fs::read_dir(&root)
        .map_err(|error| format!("Cannot read workspace: {error}"))?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .filter(|entry| !is_ignored_name(&entry.file_name().to_string_lossy(), excluded_names))
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name());

    let mut projects = Vec::new();
    let mut warnings = Vec::new();
    for entry in entries {
        let path = entry.path();
        if !is_project_candidate(&path) {
            continue;
        }
        match scan_project(&path) {
            Some(project) => projects.push(project),
            None => warnings.push(format!("Skipped unreadable project: {}", path.display())),
        }
    }

    Ok(WorkspaceSnapshot {
        root_path: root.to_string_lossy().to_string(),
        scanned_at: now_millis(),
        projects,
        warnings,
    })
}

pub fn scan_project(project_path: &Path) -> Option<ProjectSnapshot> {
    scan_project_with_storage(project_path, false)
}

pub fn scan_project_with_storage(
    project_path: &Path,
    include_storage: bool,
) -> Option<ProjectSnapshot> {
    let path = project_path.canonicalize().ok()?;
    if !path.is_dir() {
        return None;
    }

    let name = read_project_name(&path).unwrap_or_else(|| {
        path.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("Unnamed project")
            .to_string()
    });
    let commands = discover_commands(&path);
    let configuration = scan_project_configuration(&path, &commands);
    let icon_inspection = inspect_icon(&path);
    let protocol = build_protocol_status(&configuration, &icon_inspection.conformance);
    let repo = read_git_snapshot(&path);
    let description = read_project_description(&path);
    let path_string = path.to_string_lossy().to_string();
    let storage = include_storage.then(|| inspect_project_storage(&path, &configuration.cleanup));
    let build_profiles = configuration.build_profiles;
    let artifacts = include_storage.then(|| inspect_project_artifacts(&path, &build_profiles));

    Some(ProjectSnapshot {
        id: path_string.clone(),
        name,
        path: path_string,
        description,
        icon: icon_inspection.icon,
        icon_conformance: icon_inspection.conformance,
        protocol,
        repo,
        tools: configuration.tools,
        links: configuration.links,
        platforms: configuration.platforms,
        channels: configuration.channels,
        build_profiles,
        configuration: configuration.configuration,
        commands,
        cleanup: configuration.cleanup,
        storage,
        artifacts,
        scanned_at: now_millis(),
    })
}

fn is_project_candidate(path: &Path) -> bool {
    [
        ".git",
        "package.json",
        "Cargo.toml",
        "pubspec.yaml",
        "pyproject.toml",
        "ProjectSettings",
        "Assets",
    ]
    .iter()
    .any(|marker| path.join(marker).exists())
        || has_extension(path, "sln")
        || has_extension(path, "csproj")
        || has_extension(path, "xcodeproj")
        || has_extension(path, "xcworkspace")
}

fn read_project_name(path: &Path) -> Option<String> {
    if let Some(package) = read_json(path, "package.json") {
        if let Some(name) = package.get("name").and_then(Value::as_str) {
            return Some(name.to_string());
        }
    }
    for file in ["Cargo.toml", "pubspec.yaml", "pyproject.toml"] {
        if let Ok(content) = fs::read_to_string(path.join(file)) {
            for line in content.lines() {
                let value = line
                    .strip_prefix("name:")
                    .or_else(|| line.strip_prefix("name ="));
                if let Some(value) = value {
                    let value = value
                        .trim()
                        .trim_matches(|character| character == '"' || character == '\'');
                    if !value.is_empty() {
                        return Some(value.to_string());
                    }
                }
            }
        }
    }
    None
}

fn read_project_description(path: &Path) -> Option<String> {
    if let Some(package) = read_json(path, "package.json") {
        if let Some(description) = package.get("description").and_then(Value::as_str) {
            return Some(description.to_string());
        }
    }
    None
}

fn read_json(path: &Path, file: &str) -> Option<Value> {
    let content = fs::read_to_string(path.join(file)).ok()?;
    serde_json::from_str(&content).ok()
}

fn is_ignored_name(name: &str, excluded_names: &[String]) -> bool {
    IGNORED_DIRECTORIES.contains(&name)
        || excluded_names
            .iter()
            .any(|excluded| excluded.trim() == name)
}

fn has_extension(path: &Path, extension: &str) -> bool {
    fs::read_dir(path)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .any(|entry| entry.path().extension().and_then(|value| value.to_str()) == Some(extension))
}

#[cfg(test)]
mod tests {
    use super::scan_project;
    use crate::conformance::inspect_icon;
    use std::fs;

    #[test]
    fn detects_a_common_tauri_icon_as_a_data_url() {
        let root = std::env::temp_dir().join(format!("atrium-icon-test-{}", std::process::id()));
        let icons = root.join("src-tauri/icons");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&icons).expect("create icon fixture");
        fs::write(icons.join("icon.png"), b"\x89PNG\r\n\x1a\npng fixture")
            .expect("write icon fixture");

        let icon = inspect_icon(&root).icon.expect("detect icon fixture");
        assert_eq!(icon.source, "src-tauri/icons/icon.png");
        assert!(icon.data_url.starts_with("data:image/png;base64,"));

        fs::remove_dir_all(root).expect("remove icon fixture");
    }

    #[test]
    fn markdown_does_not_create_platform_or_channel_facts() {
        let root =
            std::env::temp_dir().join(format!("atrium-markdown-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create project fixture");
        fs::write(
            root.join("package.json"),
            r#"{"name":"fixture","scripts":{"dev":"vite","build":"vite build"}}"#,
        )
        .expect("write package manifest");
        fs::write(
            root.join("README.md"),
            "This document mentions TestFlight, Windows, and GitHub Releases.",
        )
        .expect("write README");

        let project = scan_project(&root).expect("scan project fixture");
        assert!(project.platforms.is_empty());
        assert!(project.channels.is_empty());

        fs::remove_dir_all(root).expect("remove project fixture");
    }
}
