use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use tauri::AppHandle;

use crate::model::{BuildArtifact, BuildArtifactKind, BuildProfile};

#[derive(Default)]
struct ArtifactMetrics {
    bytes: u64,
    file_count: u64,
    modified_at: Option<i64>,
}

pub fn inspect_project_artifacts(
    project_path: &Path,
    profiles: &[BuildProfile],
) -> Vec<BuildArtifact> {
    profiles
        .iter()
        .flat_map(|profile| {
            profile
                .artifacts
                .iter()
                .map(|relative_path| inspect_artifact(project_path, profile, relative_path))
        })
        .collect()
}

pub fn open_declared_artifact(
    app: &AppHandle,
    project_path: &Path,
    profile_id: &str,
    relative_path: &str,
) -> Result<(), String> {
    let profiles = crate::scanner::scan_project(project_path)
        .ok_or_else(|| "Project path cannot be scanned".to_string())?
        .build_profiles;
    let profile = profiles
        .iter()
        .find(|profile| profile.id == profile_id)
        .ok_or_else(|| "Build profile is not declared in the scanned project".to_string())?;
    if !profile.artifacts.iter().any(|path| path == relative_path) {
        return Err("Artifact path is not declared by this build profile".to_string());
    }

    let root = project_path
        .canonicalize()
        .map_err(|error| format!("Cannot open project: {error}"))?;
    let target = safe_declared_path(&root, relative_path)?;
    let canonical_target = target
        .canonicalize()
        .map_err(|error| format!("Artifact does not exist: {error}"))?;
    if !canonical_target.starts_with(&root) {
        return Err("Artifact path resolves outside the project".to_string());
    }
    open_path(app, &canonical_target)
}

fn inspect_artifact(
    project_path: &Path,
    profile: &BuildProfile,
    relative_path: &str,
) -> BuildArtifact {
    let target = match safe_declared_path(project_path, relative_path) {
        Ok(target) => target,
        Err(_) => {
            return BuildArtifact {
                profile_id: profile.id.clone(),
                profile_label: profile.label.clone(),
                relative_path: relative_path.to_string(),
                kind: BuildArtifactKind::Invalid,
                bytes: 0,
                file_count: 0,
                modified_at: None,
            }
        }
    };

    let Ok(metadata) = fs::symlink_metadata(&target) else {
        return BuildArtifact {
            profile_id: profile.id.clone(),
            profile_label: profile.label.clone(),
            relative_path: relative_path.to_string(),
            kind: BuildArtifactKind::Missing,
            bytes: 0,
            file_count: 0,
            modified_at: None,
        };
    };
    if metadata.file_type().is_symlink() {
        return BuildArtifact {
            profile_id: profile.id.clone(),
            profile_label: profile.label.clone(),
            relative_path: relative_path.to_string(),
            kind: BuildArtifactKind::Invalid,
            bytes: 0,
            file_count: 0,
            modified_at: None,
        };
    }

    let (kind, metrics) = if metadata.is_file() {
        (
            BuildArtifactKind::File,
            ArtifactMetrics {
                bytes: metadata.len(),
                file_count: 1,
                modified_at: modified_millis(&metadata),
            },
        )
    } else if metadata.is_dir() {
        (BuildArtifactKind::Directory, measure_directory(&target))
    } else {
        (BuildArtifactKind::Invalid, ArtifactMetrics::default())
    };

    BuildArtifact {
        profile_id: profile.id.clone(),
        profile_label: profile.label.clone(),
        relative_path: relative_path.to_string(),
        kind,
        bytes: metrics.bytes,
        file_count: metrics.file_count,
        modified_at: metrics.modified_at,
    }
}

fn safe_declared_path(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let normalized = relative_path.replace('\\', "/");
    if normalized.is_empty()
        || normalized == "."
        || normalized.starts_with('/')
        || normalized.get(1..2) == Some(":")
        || normalized
            .split('/')
            .any(|part| part.is_empty() || part == "..")
        || matches!(normalized.as_str(), ".git" | ".atrium")
    {
        return Err("Artifact path is not a safe relative path".to_string());
    }
    Ok(root.join(normalized))
}

fn measure_directory(path: &Path) -> ArtifactMetrics {
    let Ok(metadata) = fs::symlink_metadata(path) else {
        return ArtifactMetrics::default();
    };
    if metadata.file_type().is_symlink() {
        return ArtifactMetrics::default();
    }
    if metadata.is_file() {
        return ArtifactMetrics {
            bytes: metadata.len(),
            file_count: 1,
            modified_at: modified_millis(&metadata),
        };
    }
    if !metadata.is_dir() {
        return ArtifactMetrics::default();
    }

    let mut total = ArtifactMetrics {
        modified_at: modified_millis(&metadata),
        ..ArtifactMetrics::default()
    };
    let Ok(entries) = fs::read_dir(path) else {
        return total;
    };
    for entry in entries.flatten() {
        let child = measure_directory(&entry.path());
        total.bytes += child.bytes;
        total.file_count += child.file_count;
        total.modified_at = max_modified(total.modified_at, child.modified_at);
    }
    total
}

fn modified_millis(metadata: &fs::Metadata) -> Option<i64> {
    metadata
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis().min(i64::MAX as u128) as i64)
}

fn max_modified(left: Option<i64>, right: Option<i64>) -> Option<i64> {
    match (left, right) {
        (Some(left), Some(right)) => Some(left.max(right)),
        (Some(value), None) | (None, Some(value)) => Some(value),
        (None, None) => None,
    }
}

fn open_path(_app: &AppHandle, path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let (program, argument) = ("open", path.to_string_lossy().to_string());
    #[cfg(target_os = "windows")]
    let (program, argument) = ("explorer", path.to_string_lossy().to_string());
    #[cfg(all(unix, not(target_os = "macos")))]
    let (program, argument) = ("xdg-open", path.to_string_lossy().to_string());

    Command::new(program)
        .arg(argument)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Cannot open artifact: {error}"))
}

#[cfg(test)]
mod tests {
    use super::inspect_project_artifacts;
    use crate::model::{BuildArtifactKind, BuildProfile, Facet, FacetSource};
    use std::fs;

    fn profile() -> BuildProfile {
        let facet = Facet {
            key: "macos".to_string(),
            label: "macOS".to_string(),
            source: FacetSource::Configured,
            evidence: vec![],
        };
        BuildProfile {
            id: "macos-local".to_string(),
            label: "macOS · Local".to_string(),
            platform: facet.clone(),
            channel: facet,
            run_command_id: None,
            check_command_id: None,
            build_command_id: Some("build".to_string()),
            source: ".atrium/manifest.toml".to_string(),
            region: None,
            payment: None,
            artifacts: vec!["dist".to_string(), "missing.pkg".to_string()],
            issues: vec![],
        }
    }

    #[test]
    fn measures_declared_files_and_directories_without_inference() {
        let root = std::env::temp_dir().join(format!("atrium-artifacts-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("dist/assets")).expect("create artifact directory");
        fs::write(root.join("dist/assets/app.js"), b"artifact").expect("write artifact");

        let artifacts = inspect_project_artifacts(&root, &[profile()]);
        assert_eq!(artifacts.len(), 2);
        assert!(matches!(artifacts[0].kind, BuildArtifactKind::Directory));
        assert_eq!(artifacts[0].bytes, 8);
        assert!(matches!(artifacts[1].kind, BuildArtifactKind::Missing));

        fs::remove_dir_all(root).expect("remove artifact fixture");
    }
}
