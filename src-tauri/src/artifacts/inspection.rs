use std::fs;
use std::path::{Path, PathBuf};

use crate::filesystem_metrics::measure_path;
use crate::manifest_projection::normalize_declared_path;
use crate::model::{BuildArtifact, BuildArtifactKind, BuildProfile};

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
        (BuildArtifactKind::File, measure_path(&target))
    } else if metadata.is_dir() {
        (BuildArtifactKind::Directory, measure_path(&target))
    } else {
        (BuildArtifactKind::Invalid, Default::default())
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
