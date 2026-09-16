use std::fs;
use std::path::{Component, Path, PathBuf};

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum ExistingProjectPathError {
    Missing(String),
    OutsideProject,
    SymbolicLink,
}

pub(crate) fn canonical_project_root(path: &Path) -> Result<PathBuf, String> {
    let root = path
        .canonicalize()
        .map_err(|error| format!("Cannot open project: {error}"))?;
    if !root.is_dir() {
        return Err("Project path is not a directory".to_string());
    }
    Ok(root)
}

pub(crate) fn resolve_existing_path_inside_project(
    root: &Path,
    target: &Path,
) -> Result<PathBuf, ExistingProjectPathError> {
    let canonical_root = root
        .canonicalize()
        .map_err(|error| ExistingProjectPathError::Missing(error.to_string()))?;
    if target.strip_prefix(root).is_err() {
        return Err(ExistingProjectPathError::OutsideProject);
    }
    if has_symbolic_link_component(root, target)? {
        return Err(ExistingProjectPathError::SymbolicLink);
    }

    let canonical_target = target
        .canonicalize()
        .map_err(|error| ExistingProjectPathError::Missing(error.to_string()))?;
    if !canonical_target.starts_with(&canonical_root) {
        return Err(ExistingProjectPathError::OutsideProject);
    }
    Ok(canonical_target)
}

fn has_symbolic_link_component(
    root: &Path,
    target: &Path,
) -> Result<bool, ExistingProjectPathError> {
    let relative = target
        .strip_prefix(root)
        .map_err(|_| ExistingProjectPathError::OutsideProject)?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        if matches!(component, Component::CurDir) {
            continue;
        }
        current.push(component.as_os_str());
        let metadata = fs::symlink_metadata(&current)
            .map_err(|error| ExistingProjectPathError::Missing(error.to_string()))?;
        if metadata.file_type().is_symlink() {
            return Ok(true);
        }
    }
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::{
        canonical_project_root, resolve_existing_path_inside_project, ExistingProjectPathError,
    };
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

    #[cfg(unix)]
    #[test]
    fn rejects_paths_that_traverse_symbolic_links() {
        use std::os::unix::fs::symlink;

        let root = fixture_root("symlink-root");
        let outside = fixture_root("symlink-outside");
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
        fs::create_dir_all(outside.join("cache")).expect("create outside directory");
        fs::create_dir_all(&root).expect("create project directory");
        symlink(&outside, root.join("linked")).expect("create project symlink");

        assert_eq!(
            resolve_existing_path_inside_project(&root, &root.join("linked/cache"))
                .expect_err("symlink traversal must be rejected"),
            ExistingProjectPathError::SymbolicLink
        );

        fs::remove_dir_all(root).expect("remove project directory");
        fs::remove_dir_all(outside).expect("remove outside directory");
    }
}
