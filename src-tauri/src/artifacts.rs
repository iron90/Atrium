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
        assert!(matches!(artifacts[1].kind, BuildArtifactKind::Missing));

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
}
