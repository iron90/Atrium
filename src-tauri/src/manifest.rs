use std::path::Path;

use crate::conformance::MANIFEST_PATH;
use crate::manifest_projection;
use crate::manifest_schema;
use crate::model::{
    BuildProfile, CleanupDeclaration, Facet, ProjectCommand, ProjectConfiguration,
    ProjectConfigurationStatus, ProjectLink, ProjectTools,
};
use crate::project_path::read_project_text_file;

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
    let raw = match read_project_text_file(project_path, Path::new(MANIFEST_PATH)) {
        Ok(Some(raw)) => raw,
        Ok(None) => {
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

    if !manifest_schema::is_supported_schema(document.schema) {
        return invalid_configuration(
            vec![format!(
                "Unsupported Atrium manifest schema: {}. Expected schema {}.",
                document.schema,
                manifest_schema::CURRENT_SCHEMA
            )],
            Some(document.schema),
        );
    }

    manifest_projection::project(document, commands)
}

fn missing_configuration() -> ProjectConfigurationInspection {
    unavailable_configuration(
        ProjectConfigurationStatus::Missing,
        None,
        vec![format!("{MANIFEST_PATH} is not present.")],
    )
}

fn invalid_configuration(
    issues: Vec<String>,
    manifest_schema: Option<u32>,
) -> ProjectConfigurationInspection {
    unavailable_configuration(ProjectConfigurationStatus::Invalid, manifest_schema, issues)
}

fn unavailable_configuration(
    status: ProjectConfigurationStatus,
    manifest_schema: Option<u32>,
    issues: Vec<String>,
) -> ProjectConfigurationInspection {
    ProjectConfigurationInspection {
        platforms: Vec::new(),
        channels: Vec::new(),
        build_profiles: Vec::new(),
        cleanup: CleanupDeclaration::default(),
        tools: ProjectTools::default(),
        links: Vec::new(),
        manifest_status: status,
        manifest_schema,
        cleanup_issues: Vec::new(),
        configuration: ProjectConfiguration {
            status,
            manifest_path: MANIFEST_PATH.to_string(),
            issues,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::scan_project_configuration;
    use crate::model::{
        CommandKind, HostOs, IconConformance, IconConformanceStatus, ProjectCommand,
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
            r#"schema = 2

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
build = "package.json#scripts.build:macos:appstore"
run = "package.json#scripts.dev"

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
        assert_eq!(result.manifest_schema, Some(2));
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
                declared_icon: Some("icon.png".to_string()),
                resolved_icon: Some("icon.png".to_string()),
            },
        );
        assert_eq!(
            protocol.manifest_status,
            ProjectConfigurationStatus::Configured
        );
        assert_eq!(protocol.schema, Some(2));
        assert!(!protocol.needs_update);
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
    fn current_schema_keeps_host_limits_and_verification_separate_from_profile_validity() {
        let root = std::env::temp_dir().join(format!(
            "atrium-manifest-host-requirements-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(".atrium")).expect("create manifest directory");
        fs::write(
            root.join(".atrium/manifest.toml"),
            r#"schema = 2

[[platforms]]
id = "windows"
label = "Windows"

[[channels]]
id = "direct"
label = "Direct"

[[build_profiles]]
id = "windows-direct"
platform = "windows"
channel = "direct"

[build_profiles.commands]
check = "package.json#scripts.check"
build = "package.json#scripts.build:windows"

[build_profiles.host_requirements]
check = ["macos", "windows", "linux"]
build = ["windows"]

[build_profiles.verification]
check = ["macos"]
"#,
        )
        .expect("write manifest");
        let commands = vec![
            command(
                "npm:check",
                "package.json#scripts.check",
                CommandKind::Check,
            ),
            command(
                "npm:build:windows",
                "package.json#scripts.build:windows",
                CommandKind::Build,
            ),
        ];

        let result = scan_project_configuration(&root, &commands);

        assert_eq!(
            result.configuration.status,
            ProjectConfigurationStatus::Configured
        );
        assert_eq!(result.manifest_schema, Some(2));
        let protocol = build_protocol_status(
            &result,
            &IconConformance {
                status: IconConformanceStatus::Compliant,
                manifest_path: ".atrium/manifest.toml".to_string(),
                declared_icon: Some("icon.png".to_string()),
                resolved_icon: Some("icon.png".to_string()),
            },
        );
        assert!(!protocol.needs_update);
        assert_eq!(
            result.build_profiles[0].host_requirements.build,
            Some(vec![HostOs::Windows])
        );
        assert_eq!(
            result.build_profiles[0].host_requirements.check.as_deref(),
            Some([HostOs::Macos, HostOs::Windows, HostOs::Linux].as_slice())
        );
        assert_eq!(
            result.build_profiles[0].verification.check.as_deref(),
            Some([HostOs::Macos].as_slice())
        );
        assert_eq!(
            result.build_profiles[0]
                .host_mismatch_actions
                .contains(&CommandKind::Build),
            HostOs::current() != Some(HostOs::Windows)
        );

        fs::remove_dir_all(root).expect("remove manifest directory");
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

    #[test]
    fn undeclared_profile_facet_reference_is_not_synthesized_as_configured() {
        let root = std::env::temp_dir().join(format!(
            "atrium-manifest-undeclared-facet-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(".atrium")).expect("create manifest directory");
        fs::write(
            root.join(".atrium/manifest.toml"),
            r#"schema = 1

[[platforms]]
id = "macos"

[[channels]]
id = "local"

[[build_profiles]]
id = "macos-local"
platform = "ios"
channel = "local"
"#,
        )
        .expect("write manifest");

        let result = scan_project_configuration(&root, &[]);
        assert_eq!(
            result.configuration.status,
            ProjectConfigurationStatus::Invalid
        );
        assert!(result.build_profiles.is_empty());
        assert!(
            result
                .configuration
                .issues
                .iter()
                .any(|issue| issue.contains("Platform ios is not declared")),
            "issues: {:?}",
            result.configuration.issues
        );

        fs::remove_dir_all(root).expect("remove project");
    }

    #[test]
    fn trims_profile_identifiers_before_binding() {
        let root = std::env::temp_dir().join(format!(
            "atrium-manifest-profile-whitespace-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(".atrium")).expect("create manifest directory");
        fs::write(
            root.join(".atrium/manifest.toml"),
            r#"schema = 1

[[platforms]]
id = " macos "

[[channels]]
id = " local "

[[build_profiles]]
id = " macos-local "
label = " macOS local "
platform = " macos "
channel = " local "
region = " CN "
payment = " direct "
"#,
        )
        .expect("write manifest");

        let result = scan_project_configuration(&root, &[]);

        assert_eq!(
            result.configuration.status,
            ProjectConfigurationStatus::Configured
        );
        assert_eq!(result.build_profiles[0].id, "macos-local");
        assert_eq!(result.build_profiles[0].label, "macOS local");
        assert_eq!(result.build_profiles[0].platform.key, "macos");
        assert_eq!(result.build_profiles[0].channel.key, "local");
        assert_eq!(result.build_profiles[0].region.as_deref(), Some("CN"));
        assert_eq!(result.build_profiles[0].payment.as_deref(), Some("direct"));

        fs::remove_dir_all(root).expect("remove project");
    }

    #[test]
    fn identical_check_bindings_share_verification_across_profiles() {
        let current = HostOs::current().expect("supported test host");
        let other = match current {
            HostOs::Macos => HostOs::Windows,
            HostOs::Windows => HostOs::Macos,
            HostOs::Linux => HostOs::Macos,
        };
        let (current, other) = (current.as_str(), other.as_str());
        let root = std::env::temp_dir().join(format!(
            "atrium-manifest-equivalent-check-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(".atrium")).expect("create manifest directory");
        fs::write(
            root.join(".atrium/manifest.toml"),
            format!(
                r#"schema = 1

[[platforms]]
id = "{current}"

[[platforms]]
id = "{other}"

[[channels]]
id = "local"

[[build_profiles]]
id = "a"
platform = "{current}"
channel = "local"

[build_profiles.commands]
check = "package.json#scripts.quality"
build = "package.json#scripts.build:a"

[build_profiles.host_requirements]
check = ["macos", "windows", "linux"]
build = ["{current}"]

[build_profiles.verification]
check = ["{current}"]

[[build_profiles]]
id = "b"
platform = "{other}"
channel = "local"

[build_profiles.commands]
check = "package.json#scripts.quality"
build = "package.json#scripts.build:b"

[build_profiles.host_requirements]
check = ["macos", "windows", "linux"]
build = ["{current}"]
"#
            ),
        )
        .expect("write manifest");
        let commands = vec![
            command(
                "npm:quality",
                "package.json#scripts.quality",
                CommandKind::Check,
            ),
            command(
                "npm:build:a",
                "package.json#scripts.build:a",
                CommandKind::Build,
            ),
            command(
                "npm:build:b",
                "package.json#scripts.build:b",
                CommandKind::Build,
            ),
        ];

        let result = scan_project_configuration(&root, &commands);

        assert_eq!(
            result.configuration.status,
            ProjectConfigurationStatus::Configured
        );
        let profile_a = &result.build_profiles[0];
        let profile_b = &result.build_profiles[1];
        // Profile b binds the same check command that profile a verified on
        // this host, so it must not re-appear as pending verification.
        assert!(!profile_b.unverified_actions.contains(&CommandKind::Check));
        // A different command without verification stays pending.
        assert!(profile_b.unverified_actions.contains(&CommandKind::Build));
        // Profile a verified its check; its build was never verified.
        assert!(!profile_a.unverified_actions.contains(&CommandKind::Check));
        assert!(profile_a.unverified_actions.contains(&CommandKind::Build));

        fs::remove_dir_all(root).expect("remove manifest directory");
    }

    #[test]
    fn invalid_manifest_does_not_leave_partial_declarations() {
        let root =
            std::env::temp_dir().join(format!("atrium-manifest-invalid-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(".atrium")).expect("create manifest directory");
        fs::write(root.join(".atrium/manifest.toml"), "schema = [")
            .expect("write invalid manifest");

        let result = scan_project_configuration(&root, &[]);
        assert_eq!(result.manifest_status, ProjectConfigurationStatus::Invalid);
        assert_eq!(
            result.configuration.status,
            ProjectConfigurationStatus::Invalid
        );
        assert!(result.manifest_schema.is_none());
        assert!(result.platforms.is_empty());
        assert!(result.channels.is_empty());
        assert!(result.build_profiles.is_empty());
        assert!(result.cleanup.cache.is_empty());
        assert!(result.cleanup.build.is_empty());
        assert!(!result.configuration.issues.is_empty());

        fs::remove_dir_all(root).expect("remove invalid project");
    }

    #[test]
    fn rejects_unknown_fields_in_schema_one() {
        let cases = [
            ("unknown-top-level", "schema = 1\nunexpected = true\n"),
            (
                "unknown-nested",
                "schema = 1\n\n[identity]\nicon = \"icon.png\"\nunexpected = true\n",
            ),
        ];

        for (name, raw) in cases {
            let root =
                std::env::temp_dir().join(format!("atrium-manifest-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&root);
            fs::create_dir_all(root.join(".atrium")).expect("create manifest directory");
            fs::write(root.join(".atrium/manifest.toml"), raw).expect("write manifest");

            let result = scan_project_configuration(&root, &[]);
            assert_eq!(
                result.configuration.status,
                ProjectConfigurationStatus::Invalid,
                "{name}"
            );
            assert!(result.platforms.is_empty(), "{name}");
            assert!(result.channels.is_empty(), "{name}");
            assert!(result.build_profiles.is_empty(), "{name}");

            fs::remove_dir_all(root).expect("remove manifest directory");
        }
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_manifest_that_traverses_a_symbolic_link() {
        use std::os::unix::fs::symlink;

        let root = std::env::temp_dir().join(format!(
            "atrium-manifest-symlink-root-{}",
            std::process::id()
        ));
        let outside = std::env::temp_dir().join(format!(
            "atrium-manifest-symlink-outside-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
        fs::create_dir_all(root.join(".atrium")).expect("create manifest directory");
        fs::create_dir_all(&outside).expect("create outside directory");
        fs::write(outside.join("manifest.toml"), "schema = 1\n").expect("write outside manifest");
        symlink(
            outside.join("manifest.toml"),
            root.join(".atrium/manifest.toml"),
        )
        .expect("create manifest symlink");

        let result = scan_project_configuration(&root, &[]);

        assert_eq!(result.manifest_status, ProjectConfigurationStatus::Invalid);
        assert!(result
            .configuration
            .issues
            .iter()
            .any(|issue| issue.contains("symbolic links")));

        fs::remove_dir_all(root).expect("remove project directory");
        fs::remove_dir_all(outside).expect("remove outside directory");
    }

    #[test]
    fn verification_blocker_reaches_the_profile_and_stays_pending() {
        let root =
            std::env::temp_dir().join(format!("atrium-manifest-blocker-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(".atrium")).expect("create manifest directory");
        let current = HostOs::current()
            .expect("test host should be supported")
            .as_str();
        fs::write(
            root.join(".atrium/manifest.toml"),
            format!(
                r#"schema = 1

[[platforms]]
id = "{current}"

[[channels]]
id = "store"

[[build_profiles]]
id = "app-store"
platform = "{current}"
channel = "store"

[build_profiles.commands]
build = "package.json#scripts.build:store"

[build_profiles.host_requirements]
build = ["{current}"]

[[build_profiles.verification_blockers]]
action = "build"
host = "{current}"
reason = "Missing Apple Developer signing identity."
"#
            ),
        )
        .expect("write manifest");
        let commands = vec![command(
            "npm:build:store",
            "package.json#scripts.build:store",
            CommandKind::Build,
        )];

        let result = scan_project_configuration(&root, &commands);

        assert_eq!(
            result.configuration.status,
            ProjectConfigurationStatus::Configured
        );
        let profile = &result.build_profiles[0];
        assert!(profile.issues.is_empty());
        assert_eq!(profile.verification_blockers.len(), 1);
        assert_eq!(
            profile.verification_blockers[0].reason,
            "Missing Apple Developer signing identity."
        );
        assert_eq!(profile.blocked_actions.len(), 1);
        assert_eq!(profile.blocked_actions[0].action, CommandKind::Build);
        assert_eq!(
            profile.blocked_actions[0].reason,
            "Missing Apple Developer signing identity."
        );
        // A blocked action is still unverified: it stays disabled.
        assert!(profile.unverified_actions.contains(&CommandKind::Build));

        fs::remove_dir_all(root).expect("remove manifest directory");
    }

    #[test]
    fn verification_blocker_is_inherited_by_identical_bindings() {
        let root = std::env::temp_dir().join(format!(
            "atrium-manifest-blocker-inherit-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(".atrium")).expect("create manifest directory");
        let current = HostOs::current()
            .expect("test host should be supported")
            .as_str();
        fs::write(
            root.join(".atrium/manifest.toml"),
            format!(
                r#"schema = 1

[[platforms]]
id = "{current}"

[[channels]]
id = "a"

[[channels]]
id = "b"

[[build_profiles]]
id = "a"
platform = "{current}"
channel = "a"

[build_profiles.commands]
build = "package.json#scripts.build"

[[build_profiles.verification_blockers]]
action = "build"
host = "{current}"
reason = "Signing key unavailable."

[[build_profiles]]
id = "b"
platform = "{current}"
channel = "b"

[build_profiles.commands]
build = "package.json#scripts.build"
"#
            ),
        )
        .expect("write manifest");
        let commands = vec![command(
            "npm:build",
            "package.json#scripts.build",
            CommandKind::Build,
        )];

        let result = scan_project_configuration(&root, &commands);

        let profile_b = &result.build_profiles[1];
        assert!(profile_b.verification_blockers.is_empty());
        assert_eq!(profile_b.blocked_actions.len(), 1);
        assert_eq!(
            profile_b.blocked_actions[0].reason,
            "Signing key unavailable."
        );

        fs::remove_dir_all(root).expect("remove manifest directory");
    }

    #[test]
    fn verification_blocker_conflicting_with_verification_is_rejected() {
        let root = std::env::temp_dir().join(format!(
            "atrium-manifest-blocker-conflict-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(".atrium")).expect("create manifest directory");
        let current = HostOs::current()
            .expect("test host should be supported")
            .as_str();
        fs::write(
            root.join(".atrium/manifest.toml"),
            format!(
                r#"schema = 1

[[platforms]]
id = "{current}"

[[channels]]
id = "store"

[[build_profiles]]
id = "app-store"
platform = "{current}"
channel = "store"

[build_profiles.commands]
build = "package.json#scripts.build:store"

[build_profiles.verification]
build = ["{current}"]

[[build_profiles.verification_blockers]]
action = "build"
host = "{current}"
reason = "Conflicts with the verification record."
"#
            ),
        )
        .expect("write manifest");
        let commands = vec![command(
            "npm:build:store",
            "package.json#scripts.build:store",
            CommandKind::Build,
        )];

        let result = scan_project_configuration(&root, &commands);

        let profile = &result.build_profiles[0];
        assert!(profile.verification_blockers.is_empty());
        assert!(profile.blocked_actions.is_empty());
        assert!(profile
            .issues
            .iter()
            .any(|issue| issue.contains("conflicting records")));
        // The verification record wins: the action is verified, not blocked.
        assert!(!profile.unverified_actions.contains(&CommandKind::Build));

        fs::remove_dir_all(root).expect("remove manifest directory");
    }

    #[test]
    fn malformed_verification_blockers_are_reported_as_issues() {
        let root = std::env::temp_dir().join(format!(
            "atrium-manifest-blocker-invalid-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(".atrium")).expect("create manifest directory");
        let current = HostOs::current()
            .expect("test host should be supported")
            .as_str();
        // The not-in-host_requirements case must name a host the fixture does
        // not declare; on linux "linux" would be the declared host itself.
        let absent_host = if current == "linux" { "macos" } else { "linux" };
        fs::write(
            root.join(".atrium/manifest.toml"),
            format!(
                r#"schema = 1

[[platforms]]
id = "{current}"

[[channels]]
id = "store"

[[build_profiles]]
id = "app-store"
platform = "{current}"
channel = "store"

[build_profiles.commands]
build = "package.json#scripts.build:store"

[build_profiles.host_requirements]
build = ["{current}"]

[[build_profiles.verification_blockers]]
action = "deploy"
host = "{current}"
reason = "wrong action"

[[build_profiles.verification_blockers]]
action = "build"
host = "{absent_host}"
reason = "host not in host_requirements"

[[build_profiles.verification_blockers]]
action = "build"
host = "{current}"
reason = "  "

[[build_profiles.verification_blockers]]
action = "build"
host = "{current}"
reason = "Missing Apple Developer signing identity."

[[build_profiles.verification_blockers]]
action = "build"
host = "{current}"
reason = "duplicate"

[[build_profiles.verification_blockers]]
action = "build"
host = "{current}"
reason = "conflicts with verification"
"#
            ),
        )
        .expect("write manifest");
        let commands = vec![command(
            "npm:build:store",
            "package.json#scripts.build:store",
            CommandKind::Build,
        )];

        let result = scan_project_configuration(&root, &commands);

        let profile = &result.build_profiles[0];
        assert_eq!(profile.verification_blockers.len(), 1);
        assert_eq!(
            profile.verification_blockers[0].reason,
            "Missing Apple Developer signing identity."
        );
        assert_eq!(profile.blocked_actions.len(), 1);
        let joined = profile.issues.join(" ");
        assert!(joined.contains("unsupported action deploy"));
        assert!(joined.contains("not declared in host_requirements"));
        assert!(joined.contains("non-empty reason"));
        assert!(joined.contains("duplicate verification blocker"));

        fs::remove_dir_all(root).expect("remove manifest directory");
    }

    #[test]
    fn legacy_schema_still_parses_but_needs_an_update() {
        let root =
            std::env::temp_dir().join(format!("atrium-manifest-legacy-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(".atrium")).expect("create manifest directory");
        fs::write(
            root.join(".atrium/manifest.toml"),
            r#"schema = 1

[[platforms]]
id = "macos"

[[channels]]
id = "direct"

[[build_profiles]]
id = "macos-direct"
platform = "macos"
channel = "direct"

[build_profiles.commands]
build = "package.json#scripts.build"
"#,
        )
        .expect("write manifest");
        let commands = vec![command(
            "npm:build",
            "package.json#scripts.build",
            CommandKind::Build,
        )];

        let result = scan_project_configuration(&root, &commands);

        assert_eq!(
            result.configuration.status,
            ProjectConfigurationStatus::Configured
        );
        assert_eq!(result.manifest_schema, Some(1));
        let protocol = build_protocol_status(
            &result,
            &IconConformance {
                status: IconConformanceStatus::Compliant,
                manifest_path: ".atrium/manifest.toml".to_string(),
                declared_icon: Some("icon.png".to_string()),
                resolved_icon: Some("icon.png".to_string()),
            },
        );
        assert!(protocol.needs_update);

        fs::remove_dir_all(root).expect("remove manifest directory");
    }
}
