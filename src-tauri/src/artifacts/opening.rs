use std::path::Path;

use crate::os_open;
use crate::project_path::{
    canonical_project_root, resolve_existing_path_inside_project, ExistingProjectPathError,
};
use crate::scanner::scan_project;

use super::inspection::safe_declared_path;

pub fn open_declared_artifact(
    project_path: &Path,
    profile_id: &str,
    relative_path: &str,
) -> Result<(), String> {
    let profiles = scan_project(project_path)
        .ok_or_else(|| "Project path cannot be scanned".to_string())?
        .build_profiles;
    let profile = profiles
        .iter()
        .find(|profile| profile.id == profile_id)
        .ok_or_else(|| "Build profile is not declared in the scanned project".to_string())?;
    if !profile.artifacts.iter().any(|path| path == relative_path) {
        return Err("Artifact path is not declared by this build profile".to_string());
    }

    let root = canonical_project_root(project_path)?;
    let target = safe_declared_path(&root, relative_path)?;
    let canonical_target =
        resolve_existing_path_inside_project(&root, &target).map_err(|error| match error {
            ExistingProjectPathError::Missing(reason) => {
                format!("Artifact does not exist: {reason}")
            }
            ExistingProjectPathError::Unreadable(reason) => {
                format!("Cannot inspect artifact: {reason}")
            }
            ExistingProjectPathError::OutsideProject => {
                "Artifact path resolves outside the project".to_string()
            }
            ExistingProjectPathError::SymbolicLink => {
                "Artifact path cannot traverse symbolic links".to_string()
            }
        })?;
    let metadata = std::fs::metadata(&canonical_target)
        .map_err(|error| format!("Cannot inspect artifact: {error}"))?;
    if os_open::is_executable_file(&metadata) {
        return Err(
            "Artifact is an executable file; Atrium only reveals artifacts in the file manager"
                .to_string(),
        );
    }
    os_open::reveal_path(&canonical_target)
        .map_err(|error| format!("Cannot open artifact: {error}"))
}

#[cfg(all(test, unix))]
mod tests {
    use super::open_declared_artifact;
    use std::fs;
    use std::path::Path;

    fn fixture_project(name: &str) -> std::path::PathBuf {
        let root =
            std::env::temp_dir().join(format!("atrium-artifact-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(".atrium")).expect("create manifest directory");
        fs::write(
            root.join(".atrium/manifest.toml"),
            r#"schema = 1

[[platforms]]
id = "macos"

[[channels]]
id = "local"

[[build_profiles]]
id = "local"
platform = "macos"
channel = "local"
artifacts = ["dist/tool"]
"#,
        )
        .expect("write manifest");
        fs::create_dir_all(root.join("dist")).expect("create dist directory");
        root
    }

    // Only xdg-open dispatches by file type, so executable refusal is a
    // Linux-only capability error; `open -R` and `explorer /select` reveal.
    #[cfg(target_os = "linux")]
    #[test]
    fn refuses_to_open_an_executable_artifact_file() {
        use std::os::unix::fs::PermissionsExt;
        let root = fixture_project("executable");
        let artifact = root.join("dist/tool");
        fs::write(&artifact, "#!/bin/sh\necho hi\n").expect("write artifact");
        fs::set_permissions(&artifact, fs::Permissions::from_mode(0o755))
            .expect("make artifact executable");

        let error = open_declared_artifact(&root, "local", "dist/tool")
            .expect_err("executable artifacts are not opened");

        assert!(error.contains("executable"), "error: {error}");

        fs::remove_dir_all(root).expect("remove fixture project");
    }

    #[test]
    fn undeclared_artifact_paths_are_rejected() {
        let root = fixture_project("undeclared");

        let error =
            open_declared_artifact(&root, "local", "dist/other").expect_err("must be declared");
        assert!(error.contains("not declared"), "error: {error}");

        let _ = Path::new(&root).canonicalize();
        fs::remove_dir_all(root).expect("remove fixture project");
    }
}
