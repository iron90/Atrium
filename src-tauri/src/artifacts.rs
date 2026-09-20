mod inspection;
mod opening;

pub use inspection::inspect_project_artifacts;
pub use opening::open_declared_artifact;

#[cfg(test)]
mod tests {
    use super::inspect_project_artifacts;
    use super::inspection::safe_declared_path;
    use crate::model::{BuildArtifactKind, BuildProfile, Facet, FacetSource};
    use std::fs;
    use std::path::Path;

    fn profile() -> BuildProfile {
        let facet = Facet {
            key: "macos".to_string(),
            label: "macOS".to_string(),
            source: FacetSource::Configured,
            evidence: vec![],
        };
        BuildProfile {
            id: "macos-local".to_string(),
            label: "macOS · Local".to_string(),
            platform: facet.clone(),
            channel: facet,
            run_command_id: None,
            check_command_id: None,
            build_command_id: Some("build".to_string()),
            host_requirements: Default::default(),
            unsupported_actions: vec![],
            source: ".atrium/manifest.toml".to_string(),
            region: None,
            payment: None,
            artifacts: vec!["dist".to_string(), "missing.pkg".to_string()],
            issues: vec![],
        }
    }

    #[test]
    fn measures_declared_files_and_directories_without_inference() {
        let root = std::env::temp_dir().join(format!("atrium-artifacts-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("dist/assets")).expect("create artifact directory");
        fs::write(root.join("dist/assets/app.js"), b"artifact").expect("write artifact");

        let artifacts = inspect_project_artifacts(&root, &[profile()]);
        assert_eq!(artifacts.len(), 2);
        assert!(matches!(artifacts[0].kind, BuildArtifactKind::Directory));
        assert_eq!(artifacts[0].bytes, 8);
        assert!(artifacts[0].is_complete);
        assert!(matches!(artifacts[1].kind, BuildArtifactKind::Missing));
        assert!(artifacts[1].is_complete);

        fs::remove_dir_all(root).expect("remove artifact fixture");
    }

    #[test]
    fn uses_shared_manifest_path_rules_for_artifacts() {
        let root = Path::new("project");

        assert_eq!(
            safe_declared_path(root, " dist\\windows ").expect("normalize artifact path"),
            root.join("dist/windows")
        );
        for path in ["", ".", "../dist", "/tmp/dist", ".atrium"] {
            assert!(safe_declared_path(root, path).is_err(), "{path}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn rejects_artifacts_that_traverse_symbolic_links() {
        use std::os::unix::fs::symlink;

        let root = std::env::temp_dir().join(format!(
            "atrium-artifacts-symlink-root-{}",
            std::process::id()
        ));
        let outside = std::env::temp_dir().join(format!(
            "atrium-artifacts-symlink-outside-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
        fs::create_dir_all(outside.join("dist")).expect("create outside artifact directory");
        fs::write(outside.join("dist/app"), b"outside").expect("write outside artifact");
        fs::create_dir_all(&root).expect("create project directory");
        symlink(&outside, root.join("linked")).expect("create project symlink");

        let mut profile = profile();
        profile.artifacts = vec!["linked/dist".to_string()];
        let artifacts = inspect_project_artifacts(&root, &[profile]);

        assert!(matches!(artifacts[0].kind, BuildArtifactKind::Invalid));
        assert_eq!(artifacts[0].bytes, 0);

        fs::remove_dir_all(root).expect("remove project fixture");
        fs::remove_dir_all(outside).expect("remove outside fixture");
    }
}
