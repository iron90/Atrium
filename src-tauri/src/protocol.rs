use crate::conformance::MANIFEST_PATH;
use crate::manifest::ProjectConfigurationInspection;
use crate::model::{
    IconConformance, IconConformanceStatus, ProjectConfigurationStatus, ProtocolCapability,
    ProtocolCapabilityStatus, ProtocolStatus,
};

pub fn build_protocol_status(
    inspection: &ProjectConfigurationInspection,
    icon: &IconConformance,
) -> ProtocolStatus {
    let manifest_status = inspection.manifest_status;
    let manifest_issues = inspection.configuration.issues.clone();
    let manifest_is_valid = manifest_status == ProjectConfigurationStatus::Configured;

    let icon_capability = icon_capability(icon);
    let context_capability = if !manifest_is_valid {
        capability(
            "context",
            capability_status_for_manifest(&manifest_status),
            Vec::new(),
            manifest_issues.clone(),
        )
    } else {
        let status = match (
            inspection.platforms.is_empty(),
            inspection.channels.is_empty(),
        ) {
            (false, false) => ProtocolCapabilityStatus::Configured,
            (true, true) => ProtocolCapabilityStatus::Missing,
            _ => ProtocolCapabilityStatus::Partial,
        };
        let issues = match status {
            ProtocolCapabilityStatus::Configured => Vec::new(),
            ProtocolCapabilityStatus::Partial => vec![
                "Both [[platforms]] and [[channels]] are needed for a complete context."
                    .to_string(),
            ],
            _ => vec!["No platform or channel declarations were found.".to_string()],
        };
        capability(
            "context",
            status,
            vec![
                format!("{MANIFEST_PATH}#platforms"),
                format!("{MANIFEST_PATH}#channels"),
            ],
            issues,
        )
    };

    let build_capability = if !manifest_is_valid {
        capability(
            "build_profiles",
            capability_status_for_manifest(&manifest_status),
            Vec::new(),
            manifest_issues.clone(),
        )
    } else if inspection.build_profiles.is_empty() {
        capability(
            "build_profiles",
            ProtocolCapabilityStatus::Missing,
            vec![format!("{MANIFEST_PATH}#build_profiles")],
            vec!["No [[build_profiles]] entries are declared.".to_string()],
        )
    } else {
        let invalid_profiles = inspection
            .build_profiles
            .iter()
            .filter(|profile| !profile.issues.is_empty())
            .count();
        let status = if invalid_profiles == 0
            && inspection.configuration.status == ProjectConfigurationStatus::Configured
        {
            ProtocolCapabilityStatus::Configured
        } else if invalid_profiles < inspection.build_profiles.len() {
            ProtocolCapabilityStatus::Partial
        } else {
            ProtocolCapabilityStatus::Invalid
        };
        let issues = inspection
            .build_profiles
            .iter()
            .flat_map(|profile| {
                profile
                    .issues
                    .iter()
                    .map(move |issue| format!("{}: {issue}", profile.id))
            })
            .chain(
                (inspection.configuration.status == ProjectConfigurationStatus::Invalid
                    && invalid_profiles == 0)
                    .then(|| "The build configuration has additional manifest issues.".to_string()),
            )
            .collect();
        capability(
            "build_profiles",
            status,
            vec![format!("{MANIFEST_PATH}#build_profiles")],
            issues,
        )
    };

    let cleanup_capability = if !manifest_is_valid {
        capability(
            "cleanup",
            capability_status_for_manifest(&manifest_status),
            Vec::new(),
            manifest_issues,
        )
    } else if !inspection.cleanup_issues.is_empty() {
        capability(
            "cleanup",
            ProtocolCapabilityStatus::Invalid,
            vec![format!("{MANIFEST_PATH}#cleanup")],
            inspection.cleanup_issues.clone(),
        )
    } else if inspection.cleanup.cache.is_empty() && inspection.cleanup.build.is_empty() {
        capability(
            "cleanup",
            ProtocolCapabilityStatus::Missing,
            vec![format!("{MANIFEST_PATH}#cleanup")],
            vec!["No cleanup directories are declared.".to_string()],
        )
    } else {
        capability(
            "cleanup",
            ProtocolCapabilityStatus::Configured,
            vec![format!("{MANIFEST_PATH}#cleanup")],
            Vec::new(),
        )
    };

    ProtocolStatus {
        manifest_path: MANIFEST_PATH.to_string(),
        schema: inspection.manifest_schema,
        manifest_status,
        capabilities: vec![
            icon_capability,
            context_capability,
            build_capability,
            cleanup_capability,
        ],
    }
}

fn icon_capability(icon: &IconConformance) -> ProtocolCapability {
    let status = match icon.status {
        IconConformanceStatus::Compliant => ProtocolCapabilityStatus::Configured,
        IconConformanceStatus::Legacy => ProtocolCapabilityStatus::Legacy,
        IconConformanceStatus::Missing => ProtocolCapabilityStatus::Missing,
        IconConformanceStatus::Invalid => ProtocolCapabilityStatus::Invalid,
    };
    let issues = match icon.status {
        IconConformanceStatus::Compliant => Vec::new(),
        IconConformanceStatus::Legacy => {
            vec![
                "An icon was found by legacy detection but is not declared in the manifest."
                    .to_string(),
            ]
        }
        IconConformanceStatus::Missing => {
            vec!["The manifest does not declare a valid identity.icon path.".to_string()]
        }
        IconConformanceStatus::Invalid => {
            vec!["The declared icon does not satisfy the icon.v1 contract.".to_string()]
        }
    };
    let mut evidence = vec![icon.manifest_path.clone()];
    if let Some(resolved) = icon.resolved_icon.as_deref() {
        evidence.push(resolved.to_string());
    }
    capability("identity", status, evidence, issues)
}

fn capability_status_for_manifest(status: &ProjectConfigurationStatus) -> ProtocolCapabilityStatus {
    match status {
        ProjectConfigurationStatus::Configured => ProtocolCapabilityStatus::Configured,
        ProjectConfigurationStatus::Missing => ProtocolCapabilityStatus::Missing,
        ProjectConfigurationStatus::Invalid => ProtocolCapabilityStatus::Invalid,
    }
}

fn capability(
    id: &str,
    status: ProtocolCapabilityStatus,
    evidence: Vec<String>,
    issues: Vec<String>,
) -> ProtocolCapability {
    ProtocolCapability {
        id: id.to_string(),
        status,
        evidence,
        issues,
    }
}
