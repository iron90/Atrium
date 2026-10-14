mod cleanup;
mod dependencies;
mod facets;
mod links;
mod path_policy;
mod profiles;

pub(crate) use path_policy::{normalize_declared_path, path_targets_protected_component};

use crate::conformance::MANIFEST_PATH;
use crate::manifest::ProjectConfigurationInspection;
use crate::manifest_schema::{ManifestDocument, DEPENDENCY_DECLARATION_SCHEMA};
use crate::model::{ProjectCommand, ProjectConfiguration, ProjectConfigurationStatus};

/// Two declarations that name the same directory must be recognised as one
/// wherever they appear. Filesystems that ignore case would otherwise accept
/// `dist` and `DIST` as distinct artifacts and produce a second entry for a
/// path the build only ever writes once.
pub(super) fn path_comparison_key(path: &str) -> String {
    path.to_lowercase()
}

pub(crate) fn project(
    document: ManifestDocument,
    commands: &[ProjectCommand],
) -> ProjectConfigurationInspection {
    let manifest_schema = document.schema;
    // The adapter hint is intentionally accepted for protocol compatibility, but it must not
    // alter deterministic fact discovery until a concrete adapter contract exists.
    let _adapter_profile = document.profile;
    let mut issues = Vec::new();
    // A manifest may only use what its own schema declares. The install
    // binding and declared dependency paths arrived with schema 3, so a file
    // that still says schema 2 while using them is reporting configuration the
    // reader it was written for never had. It is reported rather than honoured:
    // the rest of that file may also predate rules that now apply, and running
    // half of it would hide that.
    if document.schema < DEPENDENCY_DECLARATION_SCHEMA {
        let declares_install = document.build_profiles.as_ref().is_some_and(|profiles| {
            profiles.iter().any(|profile| {
                profile
                    .commands
                    .as_ref()
                    .is_some_and(|bindings| bindings.install.is_some())
            })
        });
        if declares_install {
            issues.push("Build profile commands.install requires protocol schema 3.".to_string());
        }
        let declares_dependencies = document.dependencies.as_ref().is_some_and(|dependencies| {
            dependencies
                .paths
                .as_ref()
                .is_some_and(|paths| !paths.is_empty())
        });
        if declares_dependencies {
            issues.push("Declaring dependency paths requires protocol schema 3.".to_string());
        }
    }
    let platforms = facets::build_facets(
        document.platforms.unwrap_or_default(),
        "platforms",
        &mut issues,
    );
    let channels = facets::build_facets(
        document.channels.unwrap_or_default(),
        "channels",
        &mut issues,
    );
    let platform_map = facets::facets_by_key(&platforms);
    let channel_map = facets::facets_by_key(&channels);
    let dependencies = dependencies::parse_dependencies(document.dependencies, &mut issues);
    let cleanup_issue_start = issues.len();
    let cleanup = cleanup::parse_cleanup(document.cleanup, &mut issues);
    let cleanup_issues = issues[cleanup_issue_start..].to_vec();
    let tools = links::parse_tools(document.tools);
    if document
        .links
        .as_ref()
        .is_some_and(|links| !links.is_empty())
    {
        issues.push(
            "[[links]] is not part of the protocol. Remove it. A web project declares service_url on its web build profile; Run checks that service and opens it.".to_string(),
        );
    }
    let build_profiles = profiles::parse_build_profiles(
        document.build_profiles.unwrap_or_default(),
        &platform_map,
        &channel_map,
        commands,
        &mut issues,
    );

    for profile in &build_profiles {
        issues.extend(
            profile
                .issues
                .iter()
                .map(|issue| format!("{}: {issue}", profile.id)),
        );
    }
    if build_profiles.is_empty() {
        issues.push("No [[build_profiles]] entries are declared.".to_string());
    }

    ProjectConfigurationInspection {
        platforms,
        channels,
        build_profiles,
        dependencies,
        cleanup,
        tools,
        manifest_status: ProjectConfigurationStatus::Configured,
        manifest_schema: Some(manifest_schema),
        cleanup_issues,
        configuration: ProjectConfiguration {
            status: if issues.is_empty() {
                ProjectConfigurationStatus::Configured
            } else {
                ProjectConfigurationStatus::Invalid
            },
            manifest_path: MANIFEST_PATH.to_string(),
            issues,
        },
    }
}
