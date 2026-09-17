use std::path::Path;

use super::{GUIDANCE_PROTOCOL_SCHEMA, GUIDANCE_REVISION, GUIDANCE_SYNC_PATH};
use crate::conformance::{inspect_icon, MANIFEST_PATH};
use crate::model::{
    IconConformanceStatus, ProjectConfigurationReport, ProjectConfigurationStatus, ProjectSnapshot,
};
use crate::project_path::{canonical_project_root, write_project_text_file};

pub const CONFIGURATION_REPORT_PATH: &str = ".atrium/reports/project-configuration.md";

pub fn write_project_configuration_report(
    project_path: &Path,
    project: &ProjectSnapshot,
) -> Result<ProjectConfigurationReport, String> {
    let root = canonical_project_root(project_path)?;
    write_project_text_file(
        &root,
        Path::new(CONFIGURATION_REPORT_PATH),
        &render_configuration_report(&root, project),
    )
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
        "# Atrium project configuration guidance\n\n- Project: `{}`\n- Status: `{status}`\n- Manifest: `{MANIFEST_PATH}`\n- Guidance revision: `{GUIDANCE_REVISION}`\n- Protocol schema: `{GUIDANCE_PROTOCOL_SCHEMA}`\n\n",
        root.display()
    );
    report.push_str(
        "Atrium reads platform, channel, and build-profile facts only from the structured manifest. This report is guidance for the project development Agent; Atrium never parses this Markdown file. Schema 1 rejects unknown fields, so use only the fields shown below.\n\n",
    );
    report.push_str(&render_managed_agent_rules());
    report.push_str(&render_command_guidance());
    report.push_str(&render_manifest_template());
    report.push_str(&render_icon_guidance(&inspect_icon(root)));
    report.push_str("## Cleanup declarations\n\n");
    report.push_str(
        "Atrium cleans only directories explicitly declared by the project in the manifest. The project development Agent should add the cache and build output directories that are safe to regenerate:\n\n```toml\n[cleanup]\ncache = [\"<relative cache directory>\"]\nbuild = [\"<relative build directory>\"]\n```\n\n",
    );
    report.push_str("## Build artifact declarations\n\n");
    report.push_str(
        "Each build profile may declare files or directories it produces. Atrium only reports and opens these explicit paths; it does not infer artifacts from framework defaults:\n\n```toml\n[[build_profiles]]\n# ... profile fields ...\nartifacts = [\"<relative file or directory>\"]\n```\n\n",
    );
    report.push_str(
        "## Project tools and links\n\nThe optional `[tools]` section can name a terminal executable for this project. It is passed as a program path, never as a shell command. If it is absent or empty, Atrium uses the operating system's default terminal; users do not need to enter a command. Editor launchers are intentionally not part of the current protocol. Optional `[[links]]` entries must use a valid absolute `http://`, `https://`, or `file://` URL with no embedded credentials:\n\n```toml\n[tools]\nterminal = \"\"\n\n[[links]]\nid = \"preview\"\nlabel = \"Local preview\"\nurl = \"http://127.0.0.1:3000\"\nkind = \"preview\"\n```\n\n",
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
        &format!(
            "\nThe project development Agent should update `.atrium/manifest.toml` in the repository after verifying the project's own runtime and quality/build entrypoints, and should keep the marked `AGENTS.md` rule above installed. Only after the manifest and marked rule are actually synchronized, create or update `{GUIDANCE_SYNC_PATH}` with the current `guidance_revision` and `protocol_schema` values from `.atrium/guidance.toml`. Do not write that acknowledgement in advance. Do not invent a new command in Atrium or launch, control, or terminate Atrium.\n"
        ),
    );
    report
}

fn render_command_guidance() -> String {
    "## Run / Check / Build command bindings\n\nEach build profile must reference commands already owned by the project. First identify the profile's primary runnable target and its existing local entry point:\n\n- `run`: a command that starts or provides the primary target. A web development server is valid for a web target; a desktop target should use its own desktop launcher; CLI, game, and mobile targets should use their existing local run entry. Do not bind only a subordinate service, such as a frontend server required by a desktop shell. If no reliable entry exists, omit `run` instead of guessing.\n- `check`: an existing project quality-validation entry such as tests, lint, typecheck, or another command that reports success or failure through its exit code.\n- `build`: an existing project build entry that produces the profile's declared distributable artifacts. Build must not silently install, replace, or open an application; installation is a separate, explicit user action.\n\nThese rules are framework-neutral. A framework command such as `tauri dev` is only an example when the repository actually uses Tauri. Atrium does not invent or wrap project commands.\n\n"
        .to_string()
}

fn render_manifest_template() -> String {
    r#"## manifest.toml template

Replace every `<...>` value with a fact verified in the repository. Remove an optional block when it does not apply; do not leave example values in the manifest. Repeat the array blocks for each real platform, channel, or build profile.

```toml
schema = 1

# Optional adapter hint. Remove this line when no supported adapter applies.
# profile = "<adapter-name>"

[identity]
# Use the icon path already used by the project; Atrium does not impose a universal icon size.
icon = "<relative path to the existing project icon>"

[[platforms]]
id = "<actual-platform-id>"
label = "<Platform label>"

[[channels]]
id = "<actual-channel-id>"
label = "<Channel label>"

[[build_profiles]]
id = "<actual-profile-id>"
label = "<Platform> · <Channel>"
platform = "<actual-platform-id>"
channel = "<actual-channel-id>"
# Optional dimensions for this build context.
# region = "<actual-region>"
# payment = "<actual-payment-provider>"
# Include only artifacts this profile actually produces.
artifacts = ["<relative generated file or directory>"]

[build_profiles.commands]
# Run the profile's primary local target; omit when the project has no reliable entry.
# Do not use only a subordinate service required by another runtime.
run = "<existing command id or source>"
# Project quality validation with a meaningful success/failure exit code.
check = "<existing command id or source>"
# Project build command that produces this profile's declared artifacts.
# It must not silently install, replace, or open an application.
build = "<existing command id or source>"

# Installation is not represented by this profile; it is a separate explicit action.

# Optional: include only directories that are safe to regenerate.
[cleanup]
cache = ["<relative cache directory>"]
build = ["<relative build directory>"]

# Optional project-owned tool and link declarations.
# [tools]
# terminal = "<terminal executable path>"
#
# [[links]]
# id = "<link-id>"
# label = "<link label>"
# url = "https://<verified-project-url>"
# kind = "<link-kind>"
```

"#
    .to_string()
}

fn render_icon_guidance(inspection: &crate::conformance::IconInspection) -> String {
    let status = match inspection.conformance.status {
        IconConformanceStatus::Compliant => "configured",
        IconConformanceStatus::Legacy => "legacy",
        IconConformanceStatus::Missing => "missing",
        IconConformanceStatus::Invalid => "invalid",
    };
    let declared_icon = inspection
        .conformance
        .declared_icon
        .as_deref()
        .unwrap_or("(not declared)");
    let resolved_icon = inspection
        .conformance
        .resolved_icon
        .as_deref()
        .unwrap_or("(none)");
    let mut section = format!(
        "## Project icon\n\nUse the icon already defined by the project's framework or build convention. Atrium displays that project-provided icon as-is and does not impose a universal size, shape, or icon asset layout. The manifest only needs a relative `identity.icon` path to the readable project image used for the board preview.\n\n- Detection status: `{status}`\n- Declared path: `{declared_icon}`\n- Displayed path: `{resolved_icon}`\n\n"
    );
    if !inspection.findings.is_empty() {
        section.push_str("### Current findings\n\n");
        for finding in &inspection.findings {
            section.push_str(&format!("- {finding}\n"));
        }
        section.push('\n');
    }
    if !inspection.actions.is_empty() {
        section.push_str("### Required action\n\n");
        for action in &inspection.actions {
            section.push_str(&format!("- {action}\n"));
        }
        section.push('\n');
    }
    section
}

fn render_managed_agent_rules() -> String {
    format!(
        "## Persistent rule for `AGENTS.md`\n\nAdd or update only the marked block below in the repository's `AGENTS.md`. Preserve all unrelated project instructions.\n\n<!-- BEGIN ATRIUM MANAGED RULES -->\nAtrium guidance revision: {GUIDANCE_REVISION}\n\nWhen a development task changes the project's icon, supported platforms or channels, Run / Check / Build commands, build artifacts, cleanup directories, or another Atrium protocol field, re-read the current `.atrium/guidance.toml`, `.atrium/manifest.toml`, and relevant project files. Update `.atrium/manifest.toml` so it matches the project's actual current structure.\n\nFor each build profile, bind `run` to the project's primary local runtime entry, not only to a subordinate service used by another runtime. Web development servers are valid for web targets; desktop, CLI, game, and mobile targets should use their own existing run entries. This rule is framework-neutral: do not assume Tauri or any other framework, and use a framework command only when the project actually uses it. If no reliable run entry exists, omit the field instead of guessing. Bind `check` to the project's existing quality-validation command and `build` to the existing command that produces the declared artifacts. Build must not silently install, replace, or open an application; installation is a separate explicit user action.\n\nIf `.atrium/guidance.toml` contains a newer guidance revision, read the latest Atrium guidance reports, apply their migration instructions, and update this managed block to the latest version. Do not invent platforms, channels, commands, artifacts, or cleanup paths. Do not launch, control, or terminate Atrium.\n\nAfter applying the manifest changes and updating this marked block, update `{GUIDANCE_SYNC_PATH}` with the current `guidance_revision` and `protocol_schema` from `.atrium/guidance.toml`. Only write this acknowledgement after the synchronization is complete.\n<!-- END ATRIUM MANAGED RULES -->\n\n"
    )
}

#[cfg(test)]
mod tests {
    use super::render_managed_agent_rules;
    use crate::guidance::{GUIDANCE_REVISION, GUIDANCE_SYNC_PATH};

    #[test]
    fn includes_a_versioned_managed_agent_rule() {
        let rules = render_managed_agent_rules();

        assert!(rules.contains("<!-- BEGIN ATRIUM MANAGED RULES -->"));
        assert!(rules.contains("<!-- END ATRIUM MANAGED RULES -->"));
        assert!(rules.contains(&format!("Atrium guidance revision: {GUIDANCE_REVISION}")));
        assert!(rules.contains("Update `.atrium/manifest.toml`"));
        assert!(rules.contains("primary local runtime entry"));
        assert!(rules.contains("framework-neutral"));
        assert!(rules.contains("installation is a separate explicit user action"));
        assert!(rules.contains(GUIDANCE_SYNC_PATH));
    }
}
