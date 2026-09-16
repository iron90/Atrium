use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::Value;

use crate::model::ProjectIcon;
use crate::project_path::read_project_text_file;

use super::MAX_ICON_BYTES;

const MAX_LEGACY_SCAN_DEPTH: u8 = 4;
const MAX_LEGACY_ICON_CANDIDATES: usize = 64;
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

pub(super) fn resolve_declared_icon(root: &Path, value: &str) -> Result<PathBuf, String> {
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

pub(super) fn load_icon(root: &Path, path: &Path, canonical: bool) -> Result<ProjectIcon, String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("cannot resolve project root: {error}"))?;
    let resolved_path = path
        .canonicalize()
        .map_err(|error| format!("cannot resolve icon path: {error}"))?;
    if !resolved_path.starts_with(&canonical_root) {
        return Err("icon path resolves outside the project".to_string());
    }

    let mime = if canonical {
        canonical_icon_mime(&resolved_path)
    } else {
        icon_mime(&resolved_path)
    }
    .ok_or_else(|| {
        if canonical {
            "icon.v1 accepts only .png, .svg, and .webp files".to_string()
        } else {
            "file extension is not a supported image format".to_string()
        }
    })?;
    let bytes = read_bounded_icon(&resolved_path)?;
    validate_icon_bytes(mime, &bytes)?;

    Ok(ProjectIcon {
        data_url: format!("data:{mime};base64,{}", STANDARD.encode(bytes)),
        source: relative_path(&canonical_root, &resolved_path),
    })
}

fn read_bounded_icon(path: &Path) -> Result<Vec<u8>, String> {
    let file = fs::File::open(path).map_err(|error| format!("cannot read file: {error}"))?;
    let metadata = file
        .metadata()
        .map_err(|error| format!("cannot read metadata: {error}"))?;
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

    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(MAX_ICON_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("cannot read file: {error}"))?;
    if bytes.is_empty() {
        return Err("file is empty".to_string());
    }
    if bytes.len() as u64 > MAX_ICON_BYTES {
        return Err(format!(
            "file is larger than the {} byte limit",
            MAX_ICON_BYTES
        ));
    }
    Ok(bytes)
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

pub(super) fn legacy_icon_candidates(root: &Path) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(Some(raw)) = read_project_text_file(root, Path::new("package.json")) {
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
    if candidates.len() >= MAX_LEGACY_ICON_CANDIDATES {
        return;
    }
    let Ok(metadata) = fs::symlink_metadata(&candidate) else {
        return;
    };
    if metadata.is_file()
        && !metadata.file_type().is_symlink()
        && !candidates.iter().any(|item| item == &candidate)
    {
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
        if candidates.len() >= MAX_LEGACY_ICON_CANDIDATES {
            break;
        }
        let entry_path = entry.path();
        let entry_name = entry.file_name().to_string_lossy().to_string();
        if is_ignored_name(&entry_name) {
            continue;
        }
        let Ok(metadata) = fs::symlink_metadata(&entry_path) else {
            continue;
        };
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_file() {
            let lower_name = entry_name.to_lowercase();
            if (lower_name.contains("icon") || lower_name.contains("logo"))
                && icon_mime(&entry_path).is_some()
            {
                push_icon_candidate(candidates, entry_path);
            }
        } else if metadata.is_dir() {
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

pub(super) fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use super::{
        legacy_icon_candidates, load_icon, read_bounded_icon, MAX_ICON_BYTES,
        MAX_LEGACY_ICON_CANDIDATES,
    };
    use std::fs;

    #[test]
    fn rejects_icon_paths_that_resolve_outside_the_project() {
        let root =
            std::env::temp_dir().join(format!("atrium-icon-assets-root-{}", std::process::id()));
        let outside =
            std::env::temp_dir().join(format!("atrium-icon-assets-outside-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
        fs::create_dir_all(&root).expect("create root fixture");
        fs::create_dir_all(&outside).expect("create outside fixture");
        let icon = outside.join("icon.png");
        fs::write(&icon, b"\x89PNG\r\n\x1a\npng fixture").expect("write outside icon");

        assert!(load_icon(&root, &icon, false).is_err());

        fs::remove_dir_all(root).expect("remove root fixture");
        fs::remove_dir_all(outside).expect("remove outside fixture");
    }

    #[cfg(unix)]
    #[test]
    fn legacy_candidates_do_not_follow_symlinked_files_or_directories() {
        use std::os::unix::fs::symlink;

        let root = std::env::temp_dir().join(format!(
            "atrium-icon-assets-symlink-root-{}",
            std::process::id()
        ));
        let outside = std::env::temp_dir().join(format!(
            "atrium-icon-assets-symlink-outside-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
        fs::create_dir_all(&root).expect("create root fixture");
        fs::create_dir_all(outside.join("nested")).expect("create outside fixture");
        fs::write(outside.join("outside-icon.png"), b"icon").expect("write outside icon");
        symlink(outside.join("outside-icon.png"), root.join("icon.png"))
            .expect("link outside icon");
        symlink(outside.join("nested"), root.join("assets")).expect("link outside directory");

        let candidates = legacy_icon_candidates(&root);

        assert!(candidates.is_empty());

        fs::remove_dir_all(root).expect("remove root fixture");
        fs::remove_dir_all(outside).expect("remove outside fixture");
    }

    #[test]
    fn bounds_legacy_icon_candidate_count() {
        let root = std::env::temp_dir().join(format!(
            "atrium-icon-assets-candidate-limit-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create root fixture");
        for index in 0..(MAX_LEGACY_ICON_CANDIDATES + 10) {
            fs::write(root.join(format!("icon-{index}.png")), b"icon")
                .expect("write icon candidate");
        }

        let candidates = legacy_icon_candidates(&root);

        assert_eq!(candidates.len(), MAX_LEGACY_ICON_CANDIDATES);
        fs::remove_dir_all(root).expect("remove root fixture");
    }

    #[test]
    fn bounded_icon_read_rejects_a_file_that_exceeds_the_limit() {
        let root = std::env::temp_dir().join(format!(
            "atrium-icon-assets-read-limit-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create root fixture");
        let icon = root.join("icon.png");
        let file = fs::File::create(&icon).expect("create icon fixture");
        file.set_len(MAX_ICON_BYTES + 1).expect("grow icon fixture");

        let error = read_bounded_icon(&icon).expect_err("oversized icon should be rejected");

        assert!(error.contains("limit"));
        fs::remove_dir_all(root).expect("remove root fixture");
    }
}
