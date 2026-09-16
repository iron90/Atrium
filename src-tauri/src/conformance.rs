use std::path::Path;

use crate::manifest_schema;
use crate::model::{IconConformance, IconConformanceStatus, ProjectIcon};
use crate::project_path::read_project_text_file;

mod icon_assets;

use self::icon_assets::{legacy_icon_candidates, load_icon, relative_path, resolve_declared_icon};

pub const MANIFEST_PATH: &str = ".atrium/manifest.toml";
pub const REPORT_PATH: &str = ".atrium/reports/icon-conformance.md";
pub const ICON_SPEC: &str = "icon.v1";

pub const MAX_ICON_BYTES: u64 = 512 * 1024;

#[derive(Debug)]
pub struct IconInspection {
    pub icon: Option<ProjectIcon>,
    pub conformance: IconConformance,
    pub findings: Vec<String>,
    pub actions: Vec<String>,
}

pub fn inspect_icon(project_path: &Path) -> IconInspection {
    let root = project_path
        .canonicalize()
        .unwrap_or_else(|_| project_path.to_path_buf());

    match read_project_text_file(&root, Path::new(MANIFEST_PATH)) {
        Ok(Some(raw)) => inspect_manifest(&root, &raw),
        Ok(None) => inspect_legacy_icons(&root),
        Err(error) => invalid_inspection(
            None,
            None,
            vec![format!("Cannot read {MANIFEST_PATH}: {error}")],
            vec![format!(
                "Make {MANIFEST_PATH} readable and run the check again."
            )],
        ),
    }
}

fn inspect_manifest(root: &Path, raw: &str) -> IconInspection {
    let manifest = match manifest_schema::parse(raw) {
        Ok(manifest) => manifest,
        Err(error) => {
            return invalid_inspection(
                None,
                None,
                vec![format!("Cannot parse {MANIFEST_PATH}: {error}")],
                vec![format!(
                    "Fix {MANIFEST_PATH} so it declares schema = 1 and [identity] icon."
                )],
            );
        }
    };

    if manifest.schema != 1 {
        return invalid_inspection(
            None,
            None,
            vec![format!(
                "Unsupported Atrium manifest schema: {}. Expected schema 1.",
                manifest.schema
            )],
            vec!["Update the manifest to the supported icon.v1 schema.".to_string()],
        );
    }

    let declared_icon = manifest
        .identity
        .and_then(|identity| identity.icon)
        .filter(|value| !value.trim().is_empty());
    let Some(declared_icon) = declared_icon else {
        return missing_inspection(
            None,
            vec![format!("{MANIFEST_PATH} does not declare identity.icon.")],
            vec![format!(
                "Add [identity] icon = \"path/to/icon.png\" to {MANIFEST_PATH}."
            )],
        );
    };

    let resolved_path = match resolve_declared_icon(root, &declared_icon) {
        Ok(path) => path,
        Err(reason) => {
            return invalid_inspection(
                Some(declared_icon),
                None,
                vec![reason],
                vec![format!(
                    "Point identity.icon in {MANIFEST_PATH} to a tracked project file."
                )],
            );
        }
    };

    let icon = match load_icon(root, &resolved_path, true) {
        Ok(icon) => icon,
        Err(reason) => {
            return invalid_inspection(
                Some(declared_icon),
                Some(relative_path(root, &resolved_path)),
                vec![reason],
                vec![format!(
                    "Export a square PNG, SVG, or WebP preview icon no larger than {} KiB, then update {MANIFEST_PATH}.",
                    MAX_ICON_BYTES / 1024
                )],
            );
        }
    };

    let source = icon.source.clone();
    IconInspection {
        icon: Some(icon),
        conformance: IconConformance {
            status: IconConformanceStatus::Compliant,
            manifest_path: MANIFEST_PATH.to_string(),
            report_path: REPORT_PATH.to_string(),
            declared_icon: Some(declared_icon),
            resolved_icon: Some(source.clone()),
        },
        findings: vec![format!("Validated {source} against {ICON_SPEC}.")],
        actions: vec!["No action required.".to_string()],
    }
}

fn inspect_legacy_icons(root: &Path) -> IconInspection {
    let mut findings = vec![format!("{MANIFEST_PATH} is not present.")];
    let candidates = legacy_icon_candidates(root);

    for candidate in candidates {
        match load_icon(root, &candidate, false) {
            Ok(icon) => {
                let source = icon.source.clone();
                findings.push(format!(
                    "Legacy detection selected {source}; this path is not an Atrium declaration."
                ));
                return IconInspection {
                    icon: Some(icon),
                    conformance: IconConformance {
                        status: IconConformanceStatus::Legacy,
                        manifest_path: MANIFEST_PATH.to_string(),
                        report_path: REPORT_PATH.to_string(),
                        declared_icon: None,
                        resolved_icon: Some(source),
                    },
                    findings,
                    actions: vec![format!(
                        "Add {MANIFEST_PATH} and declare the selected icon under [identity]."
                    )],
                };
            }
            Err(reason) => findings.push(format!(
                "Rejected legacy candidate {}: {reason}",
                relative_path(root, &candidate)
            )),
        }
    }

    missing_inspection(
        None,
        findings,
        vec![format!(
            "Add a tracked PNG, SVG, or WebP preview icon and declare it in {MANIFEST_PATH}."
        )],
    )
}

fn invalid_inspection(
    declared_icon: Option<String>,
    resolved_icon: Option<String>,
    findings: Vec<String>,
    actions: Vec<String>,
) -> IconInspection {
    IconInspection {
        icon: None,
        conformance: IconConformance {
            status: IconConformanceStatus::Invalid,
            manifest_path: MANIFEST_PATH.to_string(),
            report_path: REPORT_PATH.to_string(),
            declared_icon,
            resolved_icon,
        },
        findings,
        actions,
    }
}

fn missing_inspection(
    resolved_icon: Option<String>,
    findings: Vec<String>,
    actions: Vec<String>,
) -> IconInspection {
    IconInspection {
        icon: None,
        conformance: IconConformance {
            status: IconConformanceStatus::Missing,
            manifest_path: MANIFEST_PATH.to_string(),
            report_path: REPORT_PATH.to_string(),
            declared_icon: None,
            resolved_icon,
        },
        findings,
        actions,
    }
}

#[cfg(test)]
mod tests {
    use super::inspect_icon;
    use crate::model::IconConformanceStatus;
    use std::fs;

    fn temp_project(name: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!("atrium-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create fixture project");
        root
    }

    #[test]
    fn accepts_a_valid_atrium_manifest_icon() {
        let root = temp_project("manifest-icon");
        let icon_path = root.join("assets/icon.png");
        fs::create_dir_all(icon_path.parent().expect("icon parent")).expect("create assets");
        fs::write(&icon_path, b"\x89PNG\r\n\x1a\npng fixture").expect("write icon");
        fs::create_dir_all(root.join(".atrium")).expect("create Atrium directory");
        fs::write(
            root.join(".atrium/manifest.toml"),
            "schema = 1\n\n[identity]\nicon = \"assets/icon.png\"\n",
        )
        .expect("write manifest");

        let inspection = inspect_icon(&root);
        assert_eq!(
            inspection.conformance.status,
            IconConformanceStatus::Compliant
        );
        assert_eq!(
            inspection.conformance.resolved_icon.as_deref(),
            Some("assets/icon.png")
        );
        assert!(inspection.icon.is_some());

        fs::remove_dir_all(root).expect("remove fixture project");
    }

    #[test]
    fn rejects_manifest_paths_that_escape_the_project() {
        let root = temp_project("unsafe-manifest-icon");
        fs::create_dir_all(root.join(".atrium")).expect("create Atrium directory");
        fs::write(
            root.join(".atrium/manifest.toml"),
            "schema = 1\n\n[identity]\nicon = \"../outside.png\"\n",
        )
        .expect("write manifest");

        let inspection = inspect_icon(&root);
        assert_eq!(
            inspection.conformance.status,
            IconConformanceStatus::Invalid
        );
        assert!(inspection.icon.is_none());

        fs::remove_dir_all(root).expect("remove fixture project");
    }

    #[test]
    fn legacy_icons_are_visible_but_marked_for_migration() {
        let root = temp_project("legacy-icon");
        fs::write(root.join("icon.png"), b"\x89PNG\r\n\x1a\npng fixture").expect("write icon");

        let inspection = inspect_icon(&root);
        assert_eq!(inspection.conformance.status, IconConformanceStatus::Legacy);
        assert!(inspection.icon.is_some());

        fs::remove_dir_all(root).expect("remove fixture project");
    }
}
