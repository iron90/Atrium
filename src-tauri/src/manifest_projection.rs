mod cleanup;
mod facets;
mod links;
mod path_policy;
mod profiles;

pub(crate) use path_policy::{normalize_declared_path, path_targets_protected_component};

use crate::conformance::MANIFEST_PATH;
use crate::manifest::ProjectConfigurationInspection;
use crate::manifest_schema::ManifestDocument;
use crate::model::{ProjectCommand, ProjectConfiguration, ProjectConfigurationStatus};

pub(crate) fn project(
    document: ManifestDocument,
    commands: &[ProjectCommand],
) -> ProjectConfigurationInspection {
    let manifest_schema = document.schema;
    // The adapter hint is intentionally accepted for protocol compatibility, but it must not
    // alter deterministic fact discovery until a concrete adapter contract exists.
    let _adapter_profile = document.profile;
    let mut issues = Vec::new();
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
    let cleanup_issue_start = issues.len();
    let cleanup = cleanup::parse_cleanup(document.cleanup, &mut issues);
    let cleanup_issues = issues[cleanup_issue_start..].to_vec();
    let tools = links::parse_tools(document.tools);
    let links = links::parse_links(document.links.unwrap_or_default(), &mut issues);
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
        cleanup,
        tools,
        links,
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
