use std::fs;
use std::path::Path;

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
];

const PROJECT_MARKERS: &[&str] = &[
    ".git",
    "package.json",
    "Cargo.toml",
    "pubspec.yaml",
    "pyproject.toml",
    "ProjectSettings",
    "Assets",
];

pub fn is_ignored_name(name: &str, excluded_names: &[String]) -> bool {
    IGNORED_DIRECTORIES.contains(&name)
        || excluded_names
            .iter()
            .any(|excluded| excluded.trim() == name)
}

pub fn is_project_candidate(path: &Path) -> bool {
    PROJECT_MARKERS
        .iter()
        .any(|marker| path.join(marker).exists())
        || ["sln", "csproj", "xcodeproj", "xcworkspace"]
            .iter()
            .any(|extension| has_extension(path, extension))
}

fn has_extension(path: &Path, extension: &str) -> bool {
    fs::read_dir(path)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .any(|entry| entry.path().extension().and_then(|value| value.to_str()) == Some(extension))
}

#[cfg(test)]
mod tests {
    use super::{is_ignored_name, is_project_candidate};
    use std::fs;

    #[test]
    fn applies_builtin_and_user_exclusions() {
        assert!(is_ignored_name("node_modules", &[]));
        assert!(is_ignored_name("generated", &[" generated ".to_string()]));
        assert!(!is_ignored_name("src", &[]));
    }

    #[test]
    fn recognizes_declared_project_markers() {
        let root =
            std::env::temp_dir().join(format!("atrium-workspace-policy-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create candidate fixture");
        fs::write(root.join("package.json"), "{}").expect("write project marker");

        assert!(is_project_candidate(&root));

        fs::remove_dir_all(root).expect("remove candidate fixture");
    }
}
