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

pub fn is_project_candidate(path: &Path) -> Result<bool, String> {
    for marker in PROJECT_MARKERS {
        match fs::metadata(path.join(marker)) {
            Ok(_) => return Ok(true),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!(
                    "Cannot inspect project marker {}: {error}",
                    path.join(marker).display()
                ));
            }
        }
    }

    for extension in ["sln", "csproj", "xcodeproj", "xcworkspace"] {
        if has_extension(path, extension)? {
            return Ok(true);
        }
    }

    Ok(false)
}

fn has_extension(path: &Path, extension: &str) -> Result<bool, String> {
    let entries = fs::read_dir(path)
        .map_err(|error| format!("Cannot inspect project entries {}: {error}", path.display()))?;
    for entry in entries {
        let entry = entry
            .map_err(|error| format!("Cannot inspect project entry {}: {error}", path.display()))?;
        if entry.path().extension().and_then(|value| value.to_str()) == Some(extension) {
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
}
