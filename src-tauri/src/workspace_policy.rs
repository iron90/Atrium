use std::fs;
use std::path::Path;

use crate::project_path::project_entry_exists;

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
const PROJECT_EXTENSIONS: &[&str] = &["sln", "csproj", "xcodeproj", "xcworkspace"];

pub fn is_ignored_name(name: &str, excluded_names: &[String]) -> bool {
    IGNORED_DIRECTORIES.contains(&name)
        || excluded_names
            .iter()
            .any(|excluded| excluded.trim() == name)
}

pub fn is_project_candidate(path: &Path) -> Result<bool, String> {
    for marker in PROJECT_MARKERS {
        if project_entry_exists(path, Path::new(marker))? {
            return Ok(true);
        }
    }

    if has_project_extension(path)? {
        return Ok(true);
    }

    Ok(false)
}

fn has_project_extension(path: &Path) -> Result<bool, String> {
    let entries = fs::read_dir(path)
        .map_err(|error| format!("Cannot inspect project entries {}: {error}", path.display()))?;
    for entry in entries {
        let entry = entry
            .map_err(|error| format!("Cannot inspect project entry {}: {error}", path.display()))?;
        if entry
            .file_type()
            .map_err(|error| format!("Cannot inspect project entry {}: {error}", path.display()))?
            .is_symlink()
        {
            continue;
        }
        if entry
            .path()
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|extension| PROJECT_EXTENSIONS.contains(&extension))
        {
            return Ok(true);
        }
    }
    Ok(false)
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

        assert!(is_project_candidate(&root).expect("inspect candidate fixture"));

        fs::remove_dir_all(root).expect("remove candidate fixture");
    }

    #[test]
    fn reports_candidate_inspection_errors() {
        let path = std::env::temp_dir().join(format!(
            "atrium-project-candidate-file-{}",
            std::process::id()
        ));
        let _ = fs::remove_file(&path);
        fs::write(&path, b"not a project directory").expect("write file fixture");

        let result = is_project_candidate(&path);

        assert!(result.is_err());
        fs::remove_file(path).expect("remove file fixture");
    }

    #[test]
    fn recognizes_project_file_extensions() {
        let root = std::env::temp_dir().join(format!(
            "atrium-project-extension-candidate-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create extension fixture");
        fs::write(root.join("desktop.sln"), b"solution fixture").expect("write solution");

        assert!(is_project_candidate(&root).expect("inspect extension fixture"));

        fs::remove_dir_all(root).expect("remove extension fixture");
    }

    #[cfg(unix)]
    #[test]
    fn does_not_classify_a_project_from_an_external_marker_symlink() {
        use std::os::unix::fs::symlink;

        let root = std::env::temp_dir().join(format!(
            "atrium-project-candidate-symlink-root-{}",
            std::process::id()
        ));
        let outside = std::env::temp_dir().join(format!(
            "atrium-project-candidate-symlink-outside-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
        fs::create_dir_all(&root).expect("create project candidate directory");
        fs::create_dir_all(&outside).expect("create outside directory");
        fs::write(outside.join("package.json"), b"{}").expect("write outside marker");
        symlink(outside.join("package.json"), root.join("package.json"))
            .expect("create marker symlink");

        assert!(!is_project_candidate(&root).expect("inspect candidate fixture"));

        fs::remove_dir_all(root).expect("remove project candidate directory");
        fs::remove_dir_all(outside).expect("remove outside directory");
    }
}
