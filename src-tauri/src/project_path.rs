use std::path::{Path, PathBuf};

pub(crate) fn canonical_project_root(path: &Path) -> Result<PathBuf, String> {
    let root = path
        .canonicalize()
        .map_err(|error| format!("Cannot open project: {error}"))?;
    if !root.is_dir() {
        return Err("Project path is not a directory".to_string());
    }
    Ok(root)
}

#[cfg(test)]
mod tests {
    use super::canonical_project_root;
    use std::fs;

    fn fixture_root(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("atrium-project-path-{name}-{}", std::process::id()))
    }

    #[test]
    fn resolves_an_existing_directory() {
        let root = fixture_root("directory");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create project directory");

        assert_eq!(
            canonical_project_root(&root).expect("canonical project root"),
            root.canonicalize().expect("canonical fixture root")
        );

        fs::remove_dir_all(root).expect("remove project directory");
    }

    #[test]
    fn rejects_missing_paths_and_files() {
        let missing = fixture_root("missing");
        let file = fixture_root("file");
        let _ = fs::remove_dir_all(&missing);
        let _ = fs::remove_file(&file);
        fs::write(&file, b"not a project directory").expect("create project file");

        assert!(canonical_project_root(&missing).is_err());
        assert_eq!(
            canonical_project_root(&file).expect_err("file must be rejected"),
            "Project path is not a directory"
        );

        fs::remove_file(file).expect("remove project file");
    }
}
