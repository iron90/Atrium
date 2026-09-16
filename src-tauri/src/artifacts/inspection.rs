use std::fs;
use std::path::{Path, PathBuf};

use crate::manifest_projection::normalize_declared_path;
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

fn inspect_artifact(
    project_path: &Path,
    profile: &BuildProfile,
    relative_path: &str,
) -> BuildArtifact {
    let target = match safe_declared_path(project_path, relative_path) {
        Ok(target) => target,
        Err(_) => return invalid_artifact(profile, relative_path),
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
        return invalid_artifact(profile, relative_path);
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

fn invalid_artifact(profile: &BuildProfile, relative_path: &str) -> BuildArtifact {
    BuildArtifact {
        profile_id: profile.id.clone(),
        profile_label: profile.label.clone(),
        relative_path: relative_path.to_string(),
        kind: BuildArtifactKind::Invalid,
        bytes: 0,
        file_count: 0,
        modified_at: None,
    }
}

pub(super) fn safe_declared_path(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let normalized = normalize_declared_path(relative_path, &[".git", ".atrium"])
        .ok_or_else(|| "Artifact path is not a safe relative path".to_string())?;
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
