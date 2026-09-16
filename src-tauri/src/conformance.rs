use std::fs;
use std::path::{Component, Path, PathBuf};

use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::Value;

use crate::manifest_schema;
use crate::model::{IconConformance, IconConformanceReport, IconConformanceStatus, ProjectIcon};

pub const MANIFEST_PATH: &str = ".atrium/manifest.toml";
pub const REPORT_PATH: &str = ".atrium/reports/icon-conformance.md";
pub const ICON_SPEC: &str = "icon.v1";

const MAX_ICON_BYTES: u64 = 512 * 1024;
const MAX_LEGACY_SCAN_DEPTH: u8 = 4;
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
    ".atrium",
];

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
    let manifest_path = root.join(MANIFEST_PATH);

    match fs::read_to_string(&manifest_path) {
        Ok(raw) => inspect_manifest(&root, &raw),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => inspect_legacy_icons(&root),
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

pub fn write_icon_conformance_report(project_path: &Path) -> Result<IconConformanceReport, String> {
    let root = project_path
        .canonicalize()
        .map_err(|error| format!("Cannot open project: {error}"))?;
    if !root.is_dir() {
        return Err("Project path is not a directory".to_string());
    }

    let inspection = inspect_icon(&root);
    let report_path = root.join(REPORT_PATH);
    let parent = report_path
        .parent()
        .ok_or_else(|| "Cannot determine report directory".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Cannot create report directory: {error}"))?;
    fs::write(&report_path, render_report(&root, &inspection))
        .map_err(|error| format!("Cannot write icon conformance report: {error}"))?;

    Ok(IconConformanceReport {
        path: REPORT_PATH.to_string(),
        status: inspection.conformance.status,
    })
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

fn resolve_declared_icon(root: &Path, value: &str) -> Result<PathBuf, String> {
    let relative = Path::new(value);
    if relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(format!(
            "identity.icon must be a relative path inside the project: {value}"
        ));
    }

    let candidate = root.join(relative);
    let resolved = candidate
        .canonicalize()
        .map_err(|error| format!("Icon file {value} cannot be resolved: {error}"))?;
    if !resolved.starts_with(root) {
        return Err(format!(
            "identity.icon resolves outside the project: {value}"
        ));
    }
    Ok(resolved)
}

fn load_icon(root: &Path, path: &Path, canonical: bool) -> Result<ProjectIcon, String> {
    let metadata = fs::metadata(path).map_err(|error| format!("cannot read metadata: {error}"))?;
    if !metadata.is_file() {
        return Err("path is not a regular file".to_string());
    }
    if metadata.len() == 0 {
        return Err("file is empty".to_string());
    }
    if metadata.len() > MAX_ICON_BYTES {
        return Err(format!(
            "file is {} bytes; the limit is {} bytes",
            metadata.len(),
            MAX_ICON_BYTES
        ));
    }

    let mime = if canonical {
        canonical_icon_mime(path)
    } else {
        icon_mime(path)
    }
    .ok_or_else(|| {
        if canonical {
            "icon.v1 accepts only .png, .svg, and .webp files".to_string()
        } else {
            "file extension is not a supported image format".to_string()
        }
    })?;
    let bytes = fs::read(path).map_err(|error| format!("cannot read file: {error}"))?;
    validate_icon_bytes(mime, &bytes)?;

    Ok(ProjectIcon {
        data_url: format!("data:{mime};base64,{}", STANDARD.encode(bytes)),
        source: relative_path(root, path),
    })
}

fn validate_icon_bytes(mime: &str, bytes: &[u8]) -> Result<(), String> {
    let valid = match mime {
        "image/png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "image/webp" => bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP",
        "image/jpeg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        "image/x-icon" => bytes.starts_with(&[0x00, 0x00, 0x01, 0x00]),
        "image/svg+xml" => std::str::from_utf8(bytes)
            .map(|text| text.trim_start_matches('\u{feff}').to_ascii_lowercase())
            .map(|text| text.contains("<svg"))
            .unwrap_or(false),
        _ => false,
    };
    if valid {
        Ok(())
    } else {
        Err("file contents do not match the declared image format".to_string())
    }
}

fn legacy_icon_candidates(root: &Path) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(raw) = fs::read_to_string(root.join("package.json")) {
        if let Ok(package) = serde_json::from_str::<Value>(&raw) {
            if let Some(icon) = package.get("icon").and_then(Value::as_str) {
                if !icon.contains("://") {
                    push_icon_candidate(&mut candidates, root.join(icon));
                }
            }
        }
    }

    for relative in [
        ".atrium/icon.png",
        ".atrium/icon.svg",
        "src-tauri/icons/icon.png",
        "src-tauri/icons/128x128.png",
        "src-tauri/icons/32x32.png",
        "ProjectSettings/ProjectIcon.png",
        "icon.png",
        "icon.svg",
        "icon.ico",
        "logo.png",
        "logo.svg",
        "assets/icon.png",
        "assets/icon.svg",
        "public/icon.png",
        "public/icon.svg",
    ] {
        push_icon_candidate(&mut candidates, root.join(relative));
    }
    collect_icon_candidates(root, 0, &mut candidates);
    candidates
}

fn push_icon_candidate(candidates: &mut Vec<PathBuf>, candidate: PathBuf) {
    if candidate.is_file() && !candidates.iter().any(|item| item == &candidate) {
        candidates.push(candidate);
    }
}

fn collect_icon_candidates(root: &Path, depth: u8, candidates: &mut Vec<PathBuf>) {
    if depth > MAX_LEGACY_SCAN_DEPTH {
        return;
    }
    let Ok(read_dir) = fs::read_dir(root) else {
        return;
    };
    let mut entries = read_dir.filter_map(Result::ok).collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        let entry_path = entry.path();
        let entry_name = entry.file_name().to_string_lossy().to_string();
        if is_ignored_name(&entry_name) {
            continue;
        }
        if entry_path.is_file() {
            let lower_name = entry_name.to_lowercase();
            if (lower_name.contains("icon") || lower_name.contains("logo"))
                && icon_mime(&entry_path).is_some()
            {
                push_icon_candidate(candidates, entry_path);
            }
        } else if entry_path.is_dir() {
            collect_icon_candidates(&entry_path, depth + 1, candidates);
        }
    }
}

fn icon_mime(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    match extension.as_str() {
        "png" => Some("image/png"),
        "svg" => Some("image/svg+xml"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "ico" => Some("image/x-icon"),
        _ => None,
    }
}

fn canonical_icon_mime(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "svg" => Some("image/svg+xml"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

fn is_ignored_name(name: &str) -> bool {
    IGNORED_DIRECTORIES.contains(&name)
}

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn render_report(root: &Path, inspection: &IconInspection) -> String {
    let status = match inspection.conformance.status {
        IconConformanceStatus::Compliant => "compliant",
        IconConformanceStatus::Legacy => "legacy",
        IconConformanceStatus::Missing => "missing",
        IconConformanceStatus::Invalid => "invalid",
    };
    let declared_icon = inspection
        .conformance
        .declared_icon
        .as_deref()
        .unwrap_or("(not declared)");
    let resolved_icon = inspection
        .conformance
        .resolved_icon
        .as_deref()
        .unwrap_or("(none)");

    let mut report = format!(
        "# Atrium icon conformance\n\n- Specification: `{ICON_SPEC}`\n- Project: `{}`\n- Status: `{status}`\n- Manifest: `{MANIFEST_PATH}`\n- Declared icon: `{declared_icon}`\n- Resolved icon: `{resolved_icon}`\n\n## Rules\n- `schema` must be `1`.\n- `identity.icon` must be a relative path inside the project.\n- The icon must be tracked source material, not a generated build artifact.\n- Accepted formats: PNG, SVG, or WebP.\n- Maximum file size: {} KiB.\n\n## Findings\n",
        root.display(),
        MAX_ICON_BYTES / 1024
    );
    for finding in &inspection.findings {
        report.push_str(&format!("- {finding}\n"));
    }
    report.push_str("\n## Required action\n");
    for action in &inspection.actions {
        report.push_str(&format!("- {action}\n"));
    }
    report.push_str(
        "\nThis report was generated by Atrium. The project development Agent may use it to make the repository conform to the declared project protocol.\n",
    );
    report
}

#[cfg(test)]
mod tests {
    use super::{inspect_icon, write_icon_conformance_report, REPORT_PATH};
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

    #[test]
    fn writes_an_agent_facing_report() {
        let root = temp_project("report");
        let report = write_icon_conformance_report(&root).expect("write report");
        assert_eq!(report.path, REPORT_PATH);
        assert_eq!(report.status, IconConformanceStatus::Missing);
        assert!(root.join(REPORT_PATH).is_file());

        fs::remove_dir_all(root).expect("remove fixture project");
    }
}
