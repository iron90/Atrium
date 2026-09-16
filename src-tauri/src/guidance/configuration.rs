use std::fs;
use std::path::Path;

use crate::conformance::MANIFEST_PATH;
use crate::model::{ProjectConfigurationReport, ProjectConfigurationStatus, ProjectSnapshot};
use crate::project_path::canonical_project_root;

pub const CONFIGURATION_REPORT_PATH: &str = ".atrium/reports/project-configuration.md";

pub fn write_project_configuration_report(
    project_path: &Path,
    project: &ProjectSnapshot,
) -> Result<ProjectConfigurationReport, String> {
    let root = canonical_project_root(project_path)?;
    let report_path = root.join(CONFIGURATION_REPORT_PATH);
    let parent = report_path
        .parent()
        .ok_or_else(|| "Cannot determine report directory".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Cannot create report directory: {error}"))?;
    fs::write(&report_path, render_configuration_report(&root, project))
        .map_err(|error| format!("Cannot write project configuration report: {error}"))?;

    Ok(ProjectConfigurationReport {
        path: CONFIGURATION_REPORT_PATH.to_string(),
        status: project.configuration.status,
    })
}

fn render_configuration_report(root: &Path, project: &ProjectSnapshot) -> String {
    let status = match &project.configuration.status {
        ProjectConfigurationStatus::Configured => "configured",
        ProjectConfigurationStatus::Missing => "missing",
        ProjectConfigurationStatus::Invalid => "invalid",
    };
    let mut report = format!(
        "# Atrium project configuration guidance\n\n- Project: `{}`\n- Status: `{status}`\n- Manifest: `{MANIFEST_PATH}`\n\n",
        root.display()
    );
    report.push_str(
        "Atrium reads platform, channel, and build-profile facts only from the structured manifest. This report is guidance for the project development Agent; Atrium never parses this Markdown file. Schema 1 rejects unknown fields, so use only the fields shown below.\n\n",
    );
    report.push_str("## Required manifest shape\n\n```toml\nschema = 1\nprofile = \"<adapter-name>\"\n\n# Declare only platforms this project actually builds for.\n[[platforms]]\nid = \"<platform-id>\"\nlabel = \"<Platform label>\"\n\n# Declare the distribution channel for each supported build context.\n[[channels]]\nid = \"<channel-id>\"\nlabel = \"<Channel label>\"\n\n# Bind each platform/channel combination to existing repository commands.\n[[build_profiles]]\nid = \"<profile-id>\"\nlabel = \"<Platform> · <Channel>\"\nplatform = \"<platform-id>\"\nchannel = \"<channel-id>\"\n\n[build_profiles.commands]\nrun = \"<command-id-or-source>\"\ncheck = \"<command-id-or-source>\"\nbuild = \"<command-id-or-source>\"\n```\n\n");
    report.push_str("## Cleanup declarations\n\n");
    report.push_str(
        "Atrium cleans only directories explicitly declared by the project in the manifest. The project development Agent should add the cache and build output directories that are safe to regenerate:\n\n```toml\n[cleanup]\ncache = [\"<relative cache directory>\"]\nbuild = [\"<relative build directory>\"]\n```\n\n",
    );
    report.push_str("## Build artifact declarations\n\n");
    report.push_str(
        "Each build profile may declare files or directories it produces. Atrium only reports and opens these explicit paths; it does not infer artifacts from framework defaults:\n\n```toml\n[[build_profiles]]\n# ... profile fields ...\nartifacts = [\"<relative file or directory>\"]\n```\n\n",
    );
    report.push_str(
        "## Project tools and links\n\nThe optional `[tools]` section can name a terminal executable for this project. It is passed as a program path, never as a shell command. If it is absent or empty, Atrium uses the operating system's default terminal; users do not need to enter a command. Editor launchers are intentionally not part of the current protocol. Optional `[[links]]` entries are opened only after validating their declared URL scheme:\n\n```toml\n[tools]\nterminal = \"\"\n\n[[links]]\nid = \"preview\"\nlabel = \"Local preview\"\nurl = \"http://127.0.0.1:3000\"\nkind = \"preview\"\n```\n\n",
    );
    report.push_str("## Structured commands discovered by Atrium\n\n");
    if project.commands.is_empty() {
        report.push_str("- No supported repository command was discovered.\n");
    } else {
        for command in &project.commands {
            report.push_str(&format!(
                "- `{}` — `{}` (`{}`)\n",
                command.id, command.source, command.display_command
            ));
        }
    }
    report.push_str("\n## Current issues\n\n");
    if project.configuration.issues.is_empty() {
        report.push_str("- No configuration issue was reported.\n");
    } else {
        for issue in &project.configuration.issues {
            report.push_str(&format!("- {issue}\n"));
        }
    }
    report.push_str(
        "\nThe project development Agent should update `.atrium/manifest.toml` in the repository after verifying the native build scripts. Do not invent a new build command in Atrium.\n",
    );
    report
}
