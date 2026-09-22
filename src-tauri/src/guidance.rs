use std::path::Path;

use crate::model::{ProjectGuidanceReport, ProjectSnapshot};

mod configuration;
mod metadata;

pub use configuration::write_project_configuration_report;
pub use metadata::{
    inspect_guidance_status, write_guidance_metadata, GUIDANCE_PROTOCOL_SCHEMA, GUIDANCE_REVISION,
    GUIDANCE_SYNC_PATH,
};

pub fn write_project_guidance_reports(
    project_path: &Path,
    project: &ProjectSnapshot,
) -> Result<ProjectGuidanceReport, String> {
    let configuration_report = write_project_configuration_report(project_path, project)?;
    let metadata_path = write_guidance_metadata(project_path)?;

    Ok(ProjectGuidanceReport {
        paths: vec![configuration_report.path, metadata_path],
        configuration_status: configuration_report.status,
        guidance_revision: GUIDANCE_REVISION,
    })
}

#[cfg(test)]
mod tests {
    use super::write_project_guidance_reports;
    use crate::project_scan::scan_project;
    use std::fs;

    #[test]
    fn writes_the_complete_guidance_bundle() {
        let root =
            std::env::temp_dir().join(format!("atrium-guidance-bundle-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create fixture project");
        let project = scan_project(&root).expect("scan fixture project");

        let report =
            write_project_guidance_reports(&root, &project).expect("write guidance bundle");

        assert_eq!(report.paths.len(), 2);
        assert!(root.join(".atrium/guidance.toml").is_file());
        let configuration =
            fs::read_to_string(root.join(".atrium/reports/project-configuration.md"))
                .expect("read configuration guidance");
        assert!(configuration.contains("BEGIN ATRIUM MANAGED RULES"));
        assert!(configuration.contains("## manifest.toml template"));
        assert!(configuration.contains("[[build_profiles]]"));
        assert!(configuration.contains("schema = 3"));
        assert!(configuration.contains("[build_profiles.host_requirements]"));
        assert!(configuration.contains("lower compatibility boundary"));
        assert!(configuration.contains("[build_profiles.verification]"));
        assert!(configuration.contains("verification matrix"));
        assert!(configuration.contains("Validation blockers and completion"));
        assert!(configuration.contains("partial-progress marker"));
        assert!(configuration.contains("## Project icon"));
        assert!(!root.join(".atrium/reports/icon-conformance.md").exists());
        fs::remove_dir_all(root).expect("remove fixture project");
    }
}
