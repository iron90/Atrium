use std::path::Path;

use crate::model::{ProjectGuidanceReport, ProjectSnapshot};

mod configuration;
mod icon;

pub use configuration::write_project_configuration_report;
pub use icon::write_icon_conformance_report;

pub fn write_project_guidance_reports(
    project_path: &Path,
    project: &ProjectSnapshot,
) -> Result<ProjectGuidanceReport, String> {
    let configuration_report = write_project_configuration_report(project_path, project)?;
    let icon_report = write_icon_conformance_report(project_path)?;

    Ok(ProjectGuidanceReport {
        paths: vec![configuration_report.path, icon_report.path],
        configuration_status: configuration_report.status,
        icon_status: icon_report.status,
    })
}
