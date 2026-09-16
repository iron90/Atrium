pub(crate) fn normalize_declared_path(raw: &str, protected: &[&str]) -> Option<String> {
    let normalized = raw.trim().replace('\\', "/");
    let invalid = normalized.is_empty()
        || normalized == "."
        || normalized.starts_with('/')
        || normalized.get(1..2) == Some(":")
        || normalized
            .split('/')
            .any(|part| part.is_empty() || part == "..");
    let is_protected = protected.iter().any(|path| *path == normalized);

    if invalid || is_protected {
        None
    } else {
        Some(normalized)
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_declared_path;

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
}
