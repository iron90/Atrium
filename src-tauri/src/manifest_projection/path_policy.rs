use std::path::Path;

pub(crate) fn normalize_declared_path(raw: &str, protected: &[&str]) -> Option<String> {
    let normalized = raw.trim().replace('\\', "/");
    let invalid = normalized.is_empty()
        || normalized == "."
        || normalized.starts_with('/')
        || normalized.get(1..2) == Some(":")
        || normalized
            .split('/')
            .any(|part| part.is_empty() || part == "..")
        // Win32 path normalization strips trailing dots/spaces from components,
        // so a component like ".git." or "cache " would resolve to a different
        // name on Windows than the one validated here. Such components are
        // pathological on Windows; reject them at declaration time.
        || normalized
            .split('/')
            .any(|part| part.ends_with('.') || part.ends_with(' '));
    let is_protected = normalized
        .split('/')
        .any(|part| protected.iter().any(|path| part.eq_ignore_ascii_case(path)));

    if invalid || is_protected {
        None
    } else {
        Some(normalized)
    }
}

pub(crate) fn path_targets_protected_component(
    canonical_root: &Path,
    canonical_target: &Path,
    protected: &[&str],
) -> bool {
    canonical_target
        .strip_prefix(canonical_root)
        .ok()
        .map(|relative| {
            relative.components().any(|component| {
                protected
                    .iter()
                    .any(|name| component.as_os_str().eq_ignore_ascii_case(name))
            })
        })
        .unwrap_or(true)
}

#[cfg(test)]
mod tests {
    use super::{normalize_declared_path, path_targets_protected_component};
    use std::path::Path;

    #[test]
    fn normalizes_windows_separators() {
        assert_eq!(
            normalize_declared_path(" dist\\windows ", &[]),
            Some("dist/windows".to_string())
        );
    }

    #[test]
    fn rejects_paths_that_escape_or_are_absolute() {
        for path in [
            "../dist",
            "dist/../source",
            "/tmp/dist",
            "C:/dist",
            "dist//app",
        ] {
            assert_eq!(normalize_declared_path(path, &[]), None, "{path}");
        }
    }

    #[test]
    fn rejects_empty_and_protected_paths() {
        assert_eq!(normalize_declared_path(".", &[]), None);
        assert_eq!(normalize_declared_path(".atrium", &[".atrium"]), None);
        assert_eq!(
            normalize_declared_path("dist", &[".atrium"]),
            Some("dist".to_string())
        );
    }

    #[test]
    fn rejects_protected_directory_components() {
        for path in [".git/objects", "dist/.atrium/report", "node_modules/cache"] {
            assert_eq!(
                normalize_declared_path(path, &[".git", ".atrium", "node_modules"]),
                None,
                "{path}"
            );
        }
        assert_eq!(
            normalize_declared_path("dist/Node_Modules/cache", &["node_modules"]),
            None
        );
    }

    #[test]
    fn rejects_components_with_trailing_dots_or_spaces() {
        for path in [".git.", "dist/.", "dist. /cache", "cache.", "dist /cache"] {
            assert_eq!(normalize_declared_path(path, &[]), None, "{path:?}");
        }
    }

    #[test]
    fn canonical_recheck_rejects_protected_components() {
        let root = Path::new("/workspace/project");
        assert!(path_targets_protected_component(
            root,
            &root.join(".git/objects"),
            &[".git", ".atrium"]
        ));
        assert!(path_targets_protected_component(
            root,
            &root.join(".atrium"),
            &[".git", ".atrium"]
        ));
        assert!(!path_targets_protected_component(
            root,
            &root.join("dist/windows"),
            &[".git", ".atrium"]
        ));
    }

    #[test]
    fn canonical_recheck_fails_closed_outside_the_root() {
        assert!(path_targets_protected_component(
            Path::new("/workspace/project"),
            Path::new("/elsewhere/project/.git"),
            &[".git", ".atrium"]
        ));
    }
}
