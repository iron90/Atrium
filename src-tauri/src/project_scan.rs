use std::path::Path;

use crate::artifacts::inspect_project_artifacts;
use crate::command_discovery::discover_commands;
use crate::conformance::inspect_icon;
use crate::git::read_git_snapshot;
use crate::manifest::scan_project_configuration;
use crate::model::ProjectSnapshot;
use crate::project_metadata::{read_project_description, read_project_name};
use crate::protocol::build_protocol_status;
use crate::storage::inspect_project_storage;
use crate::time::now_millis;

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
