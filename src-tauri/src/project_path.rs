use std::fs;
use std::path::{Component, Path, PathBuf};

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum ExistingProjectPathError {
    Missing(String),
    Unreadable(String),
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

pub(crate) fn project_entry_exists(root: &Path, relative: &Path) -> Result<bool, String> {
    let canonical_root = canonical_project_root(root)?;
    let target = safe_relative_target(&canonical_root, relative)?;
    match resolve_existing_path_inside_project(&canonical_root, &target) {
        Ok(_) => Ok(true),
        Err(ExistingProjectPathError::Missing(_)) | Err(ExistingProjectPathError::SymbolicLink) => {
            Ok(false)
        }
        Err(ExistingProjectPathError::Unreadable(reason)) => Err(format!(
            "Cannot inspect project entry {}: {reason}",
            relative.display()
        )),
        Err(ExistingProjectPathError::OutsideProject) => Err(format!(
            "Project entry is outside the project: {}",
            relative.display()
        )),
    }
}

pub(crate) fn read_project_text_file(
    root: &Path,
    relative: &Path,
) -> Result<Option<String>, String> {
    let canonical_root = canonical_project_root(root)?;
    let target = safe_relative_target(&canonical_root, relative)?;
    let resolved = match resolve_existing_path_inside_project(&canonical_root, &target) {
        Ok(path) => path,
        Err(ExistingProjectPathError::Missing(_)) => return Ok(None),
        Err(ExistingProjectPathError::Unreadable(reason)) => {
            return Err(format!(
                "Cannot read project file {}: {reason}",
                relative.display()
            ));
        }
        Err(ExistingProjectPathError::OutsideProject) => {
            return Err(format!(
                "Project file is outside the project: {}",
                relative.display()
            ));
        }
        Err(ExistingProjectPathError::SymbolicLink) => {
            return Err(format!(
                "Project file cannot traverse symbolic links: {}",
                relative.display()
            ));
        }
    };
    let metadata = fs::metadata(&resolved).map_err(|error| {
        format!(
            "Cannot inspect project file {}: {error}",
            relative.display()
        )
    })?;
    if !metadata.is_file() {
        return Err(format!(
            "Project path is not a regular file: {}",
            relative.display()
        ));
    }
    fs::read_to_string(&resolved)
        .map(Some)
        .map_err(|error| format!("Cannot read project file {}: {error}", relative.display()))
}

pub(crate) fn write_project_text_file(
    root: &Path,
    relative: &Path,
    content: &str,
) -> Result<(), String> {
    let canonical_root = canonical_project_root(root)?;
    let target = safe_relative_target(&canonical_root, relative)?;
    ensure_parent_directories(&canonical_root, &target, relative)?;
    match fs::symlink_metadata(&target) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Err(format!(
                "Project file cannot overwrite a symbolic link: {}",
                relative.display()
            ));
        }
        Ok(metadata) if !metadata.is_file() => {
            return Err(format!(
                "Project file is not a regular file: {}",
                relative.display()
            ));
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(format!(
                "Cannot inspect project file {}: {error}",
                relative.display()
            ));
        }
    }
    fs::write(&target, content)
        .map_err(|error| format!("Cannot write project file {}: {error}", relative.display()))
}

fn ensure_parent_directories(root: &Path, target: &Path, relative: &Path) -> Result<(), String> {
    let parent = target
        .parent()
        .ok_or_else(|| format!("Cannot determine parent directory: {}", relative.display()))?;
    let relative_parent = parent.strip_prefix(root).map_err(|_| {
        format!(
            "Project file is outside the project: {}",
            relative.display()
        )
    })?;
    let mut current = root.to_path_buf();
    for component in relative_parent.components() {
        if matches!(component, Component::CurDir) {
            continue;
        }
        current.push(component.as_os_str());
        ensure_directory_component(&current, relative)?;
    }
    Ok(())
}

fn ensure_directory_component(path: &Path, relative: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => validate_directory_component(path, relative, &metadata),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir(path)
                .or_else(|create_error| {
                    if create_error.kind() == std::io::ErrorKind::AlreadyExists {
                        Ok(())
                    } else {
                        Err(create_error)
                    }
                })
                .map_err(|error| {
                    format!(
                        "Cannot create project directory {}: {error}",
                        relative.display()
                    )
                })?;
            let metadata = fs::symlink_metadata(path).map_err(|error| {
                format!(
                    "Cannot inspect project directory {}: {error}",
                    relative.display()
                )
            })?;
            validate_directory_component(path, relative, &metadata)
        }
        Err(error) => Err(format!(
            "Cannot inspect project directory {}: {error}",
            relative.display()
        )),
    }
}

fn validate_directory_component(
    path: &Path,
    relative: &Path,
    metadata: &fs::Metadata,
) -> Result<(), String> {
    if metadata.file_type().is_symlink() {
        return Err(format!(
            "Project directory cannot traverse symbolic links: {}",
            relative.display()
        ));
    }
    if !metadata.is_dir() {
        return Err(format!(
            "Project report parent is not a directory: {}",
            path.display()
        ));
    }
    Ok(())
}

fn safe_relative_target(root: &Path, relative: &Path) -> Result<PathBuf, String> {
    if relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(format!(
            "Project entry must be a relative path inside the project: {}",
            relative.display()
        ));
    }
    Ok(root.join(relative))
}

pub(crate) fn resolve_existing_path_inside_project(
    root: &Path,
    target: &Path,
) -> Result<PathBuf, ExistingProjectPathError> {
    let canonical_root = root.canonicalize().map_err(classify_path_error)?;
    if target.strip_prefix(root).is_err() {
        return Err(ExistingProjectPathError::OutsideProject);
    }
    if has_symbolic_link_component(root, target)? {
        return Err(ExistingProjectPathError::SymbolicLink);
    }

    let canonical_target = target.canonicalize().map_err(classify_path_error)?;
    if !canonical_target.starts_with(&canonical_root) {
        return Err(ExistingProjectPathError::OutsideProject);
    }
    Ok(canonical_target)
}

pub(crate) fn has_symbolic_link_component(
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
        let metadata = fs::symlink_metadata(&current).map_err(classify_path_error)?;
        if metadata.file_type().is_symlink() {
            return Ok(true);
        }
    }
    Ok(false)
}

fn classify_path_error(error: std::io::Error) -> ExistingProjectPathError {
    if error.kind() == std::io::ErrorKind::NotFound {
        ExistingProjectPathError::Missing(error.to_string())
    } else {
        ExistingProjectPathError::Unreadable(error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        canonical_project_root, project_entry_exists, read_project_text_file,
        resolve_existing_path_inside_project, write_project_text_file, ExistingProjectPathError,
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

    #[test]
    fn reads_only_regular_files_inside_the_project() {
        let root = fixture_root("safe-read");
        fs::create_dir_all(&root).expect("create project directory");
        fs::write(root.join("package.json"), "{\"name\":\"fixture\"}").expect("write project file");

        assert_eq!(
            read_project_text_file(&root, std::path::Path::new("package.json"))
                .expect("read project file")
                .as_deref(),
            Some("{\"name\":\"fixture\"}")
        );
        assert!(
            project_entry_exists(&root, std::path::Path::new("package.json"))
                .expect("inspect project file")
        );
        assert!(
            !project_entry_exists(&root, std::path::Path::new("missing.json"))
                .expect("inspect missing project file")
        );

        fs::remove_dir_all(root).expect("remove project directory");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_project_files_that_traverse_symbolic_links() {
        use std::os::unix::fs::symlink;

        let root = fixture_root("safe-read-symlink");
        let outside = fixture_root("safe-read-outside");
        fs::create_dir_all(&root).expect("create project directory");
        fs::create_dir_all(&outside).expect("create outside directory");
        fs::write(outside.join("package.json"), "{\"name\":\"outside\"}")
            .expect("write outside file");
        symlink(outside.join("package.json"), root.join("package.json"))
            .expect("create descriptor symlink");

        let result = read_project_text_file(&root, std::path::Path::new("package.json"));

        assert!(result
            .expect_err("symlinked descriptor must be rejected")
            .contains("symbolic links"));
        assert!(
            !project_entry_exists(&root, std::path::Path::new("package.json"))
                .expect("inspect symlinked descriptor")
        );

        fs::remove_dir_all(root).expect("remove project directory");
        fs::remove_dir_all(outside).expect("remove outside directory");
    }

    #[test]
    fn creates_a_project_local_file_without_following_parent_links() {
        let root = fixture_root("safe-write");
        fs::create_dir_all(&root).expect("create project directory");

        write_project_text_file(
            &root,
            std::path::Path::new(".atrium/reports/example.md"),
            "report",
        )
        .expect("write project report");

        assert_eq!(
            fs::read_to_string(root.join(".atrium/reports/example.md"))
                .expect("read project report"),
            "report"
        );

        fs::remove_dir_all(root).expect("remove project directory");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_project_report_paths_that_traverse_symbolic_links() {
        use std::os::unix::fs::symlink;

        let root = fixture_root("safe-write-symlink");
        let outside = fixture_root("safe-write-outside");
        fs::create_dir_all(&root).expect("create project directory");
        fs::create_dir_all(&outside).expect("create outside directory");
        symlink(&outside, root.join(".atrium")).expect("create report parent symlink");

        let result = write_project_text_file(
            &root,
            std::path::Path::new(".atrium/reports/example.md"),
            "must stay inside",
        );

        assert!(result
            .expect_err("report parent symlink must be rejected")
            .contains("symbolic links"));
        assert!(!outside.join("reports/example.md").exists());

        fs::remove_dir_all(root).expect("remove project directory");
        fs::remove_dir_all(outside).expect("remove outside directory");
    }
}
