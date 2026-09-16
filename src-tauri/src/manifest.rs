use std::fs;
use std::path::Path;

use crate::conformance::MANIFEST_PATH;
use crate::manifest_projection;
use crate::manifest_schema;
use crate::model::{
    BuildProfile, CleanupDeclaration, Facet, ProjectCommand, ProjectConfiguration,
    ProjectConfigurationStatus, ProjectLink, ProjectTools,
};

#[derive(Debug)]
pub struct ProjectConfigurationInspection {
    pub platforms: Vec<Facet>,
    pub channels: Vec<Facet>,
    pub build_profiles: Vec<BuildProfile>,
    pub cleanup: CleanupDeclaration,
    pub tools: ProjectTools,
    pub links: Vec<ProjectLink>,
    pub manifest_status: ProjectConfigurationStatus,
    pub manifest_schema: Option<u32>,
    pub cleanup_issues: Vec<String>,
    pub configuration: ProjectConfiguration,
}

pub fn scan_project_configuration(
    project_path: &Path,
    commands: &[ProjectCommand],
) -> ProjectConfigurationInspection {
    let manifest_path = project_path.join(MANIFEST_PATH);
    let raw = match fs::read_to_string(&manifest_path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return missing_configuration();
        }
        Err(error) => {
            return invalid_configuration(
                vec![format!("Cannot read {MANIFEST_PATH}: {error}")],
                None,
            );
        }
    };

    let document = match manifest_schema::parse(&raw) {
        Ok(document) => document,
        Err(error) => {
            return invalid_configuration(
                vec![format!("Cannot parse {MANIFEST_PATH}: {error}")],
                None,
            );
        }
    };

    if document.schema != 1 {
        return invalid_configuration(
            vec![format!(
                "Unsupported Atrium manifest schema: {}. Expected schema 1.",
                document.schema
            )],
            Some(document.schema),
        );
    }

    manifest_projection::project(document, commands)
}

fn missing_configuration() -> ProjectConfigurationInspection {
    ProjectConfigurationInspection {
        platforms: Vec::new(),
        channels: Vec::new(),
        build_profiles: Vec::new(),
        cleanup: CleanupDeclaration::default(),
        tools: ProjectTools::default(),
        links: Vec::new(),
        manifest_status: ProjectConfigurationStatus::Missing,
        manifest_schema: None,
        cleanup_issues: Vec::new(),
        configuration: ProjectConfiguration {
            status: ProjectConfigurationStatus::Missing,
            manifest_path: MANIFEST_PATH.to_string(),
            issues: vec![format!("{MANIFEST_PATH} is not present.")],
        },
    }
}

fn invalid_configuration(
    issues: Vec<String>,
    manifest_schema: Option<u32>,
) -> ProjectConfigurationInspection {
    ProjectConfigurationInspection {
        platforms: Vec::new(),
        channels: Vec::new(),
        build_profiles: Vec::new(),
        cleanup: CleanupDeclaration::default(),
        tools: ProjectTools::default(),
        links: Vec::new(),
        manifest_status: ProjectConfigurationStatus::Invalid,
        manifest_schema,
        cleanup_issues: Vec::new(),
        configuration: ProjectConfiguration {
            status: ProjectConfigurationStatus::Invalid,
            manifest_path: MANIFEST_PATH.to_string(),
            issues,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::scan_project_configuration;
    use crate::model::{
        CommandKind, IconConformance, IconConformanceStatus, ProjectCommand,
        ProjectConfigurationStatus, ProtocolCapabilityStatus,
    };
    use crate::protocol::build_protocol_status;
    use std::fs;

    fn command(id: &str, source: &str, kind: CommandKind) -> ProjectCommand {
        ProjectCommand {
            id: id.to_string(),
            kind,
            label: id.to_string(),
            program: "npm".to_string(),
            args: vec!["run".to_string(), id.to_string()],
            working_directory: "/tmp/project".to_string(),
            display_command: format!("npm run {id}"),
            source: source.to_string(),
        }
    }

    #[test]
    fn reads_explicit_platform_channel_and_profile_bindings() {
        let root = std::env::temp_dir().join(format!("atrium-manifest-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(".atrium")).expect("create manifest directory");
        fs::write(
            root.join(".atrium/manifest.toml"),
            r#"schema = 1

[[platforms]]
id = "macos"
label = "macOS"

[[channels]]
id = "apple-app-store"
label = "App Store"

[[build_profiles]]
id = "macos-app-store"
platform = "macos"
channel = "apple-app-store"
artifacts = ["dist/Atrium.dmg", "src-tauri/target/release/bundle/macos"]

[build_profiles.commands]
run = "package.json#scripts.dev"
build = "package.json#scripts.build:macos:appstore"

[cleanup]
cache = [".cache"]
build = ["dist"]
"#,
        )
        .expect("write manifest");
        let commands = vec![
            command("npm:dev", "package.json#scripts.dev", CommandKind::Run),
            command(
                "npm:build:macos:appstore",
                "package.json#scripts.build:macos:appstore",
                CommandKind::Other,
            ),
        ];

        let result = scan_project_configuration(&root, &commands);
        assert_eq!(
            result.configuration.status,
            ProjectConfigurationStatus::Configured
        );
        assert_eq!(result.platforms[0].key, "macos");
        assert_eq!(result.channels[0].key, "apple-app-store");
        assert_eq!(
            result.build_profiles[0].build_command_id.as_deref(),
            Some("npm:build:macos:appstore")
        );
        assert_eq!(
            result.build_profiles[0].run_command_id.as_deref(),
            Some("npm:dev")
        );
        assert_eq!(result.manifest_schema, Some(1));
        assert_eq!(result.cleanup.cache, vec![".cache"]);
        assert_eq!(result.cleanup.build, vec!["dist"]);
        assert_eq!(
            result.build_profiles[0].artifacts,
            vec![
                "dist/Atrium.dmg".to_string(),
                "src-tauri/target/release/bundle/macos".to_string()
            ]
        );

        let protocol = build_protocol_status(
            &result,
            &IconConformance {
                status: IconConformanceStatus::Compliant,
                manifest_path: ".atrium/manifest.toml".to_string(),
                report_path: ".atrium/reports/icon-conformance.md".to_string(),
                declared_icon: Some("icon.png".to_string()),
                resolved_icon: Some("icon.png".to_string()),
            },
        );
        assert_eq!(
            protocol.manifest_status,
            ProjectConfigurationStatus::Configured
        );
        assert_eq!(protocol.schema, Some(1));
        assert_eq!(
            protocol
                .capabilities
                .iter()
                .find(|capability| capability.id == "context")
                .expect("context capability")
                .status,
            ProtocolCapabilityStatus::Configured
        );
        assert_eq!(
            protocol
                .capabilities
                .iter()
                .find(|capability| capability.id == "cleanup")
                .expect("cleanup capability")
                .status,
            ProtocolCapabilityStatus::Configured
        );

        fs::remove_dir_all(root).expect("remove manifest directory");
    }

    #[test]
    fn missing_manifest_does_not_infer_any_platform_or_channel() {
        let root =
            std::env::temp_dir().join(format!("atrium-manifest-missing-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create project");

        let result = scan_project_configuration(&root, &[]);
        assert_eq!(
            result.configuration.status,
            ProjectConfigurationStatus::Missing
        );
        assert!(result.platforms.is_empty());
        assert!(result.channels.is_empty());
        assert!(result.build_profiles.is_empty());

        fs::remove_dir_all(root).expect("remove project");
    }

    #[test]
    fn manifest_without_build_profiles_is_not_executable_configuration() {
        let root = std::env::temp_dir().join(format!(
            "atrium-manifest-no-profiles-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(".atrium")).expect("create manifest directory");
        fs::write(
            root.join(".atrium/manifest.toml"),
            r#"schema = 1

[[platforms]]
id = "macos"
label = "macOS"

[[channels]]
id = "website"
label = "Website"
"#,
        )
        .expect("write manifest");

        let result = scan_project_configuration(&root, &[]);
        assert_eq!(
            result.configuration.status,
            ProjectConfigurationStatus::Invalid
        );
        assert!(result.build_profiles.is_empty());

        fs::remove_dir_all(root).expect("remove project");
    }
}
