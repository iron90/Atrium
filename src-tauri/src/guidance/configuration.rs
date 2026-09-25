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
        "Atrium reads platform, channel, and build-profile facts only from the structured manifest. This report is guidance for the project development Agent; Atrium never parses this Markdown file. The manifest schema rejects unknown fields, so use only the fields shown below. Older schemas remain readable for compatibility, but new capability declarations require the current schema.\n\n",
    );
    report.push_str(&render_managed_agent_rules());
    report.push_str(&render_manifest_template());
    report.push_str(&render_icon_guidance(&inspect_icon(root)));
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
            "\nWhen finished, report the changed files, the declared platforms and channels, the command bindings, and a verification matrix with profile, action, host, the exact command executed, the final exit code, and the success postcondition (readiness/smoke result or the artifacts produced by that run). Explain hosts that are undeclared, mismatched, deferred, or failed. If a matching-host environment blocker remains, mark the integration as incomplete and do not update `{GUIDANCE_SYNC_PATH}`.\n"
        ),
    );
    report
}

fn binding_rules() -> String {
    "## Run / Check / Build command bindings\n\nEach build profile must reference commands already owned by the project. First identify the profile's primary local runtime entry and its existing local entry point:\n\n- `run`: a command that starts or provides the primary target. A web development server is valid for a web target; a desktop target should use its own desktop launcher; CLI, game, and mobile targets should use their existing local run entry. Do not bind only a subordinate service, such as a frontend server required by a desktop shell. If no reliable entry exists, omit `run` instead of guessing.\n- `check`: an existing project quality-validation entry such as tests, lint, typecheck, or another command that reports success or failure through its exit code.\n- `build`: an existing project build entry that produces the profile's declared distributable artifacts. Build must not silently install, replace, or open an application; installation is a separate, explicit user action.\n\nThese rules are framework-neutral. A framework command such as `tauri dev` is only an example when the repository actually uses Tauri. Atrium does not invent or wrap project commands.\n\n"
        .to_string()
}

fn host_verification_rules() -> String {
    "## Host requirements and verification\n\n`platform` is the target of the produced artifact. Keep the artifact target, compatible execution hosts, and verification evidence separate; do not infer either host requirement or verification from the target platform. `[build_profiles.host_requirements]` declares the hosts where an action may execute; it is the lower compatibility boundary, not proof that the action has passed. `[build_profiles.verification]` records hosts where the exact bound action has passed; it is the upper evidence boundary. Declare host requirements and verification independently for `run`, `check`, and `build` using only `macos`, `windows`, or `linux`, and update them whenever cross-compilation or toolchain support changes.\n\nFor every profile action and candidate host, inspect the actual program, args, working directory, expanded scripts, SDKs, and toolchain. If the current host is not listed in `host_requirements`, do not run the action, do not call it a failure, and do not remove its command binding; record the mismatch as deferred verification. When the current host matches, run the exact project command and use these postconditions as proof:\n\n| Action | Required proof |\n| --- | --- |\n| `run` | The primary target starts and passes an available readiness or smoke check; process spawn alone is not enough. |\n| `check` | The complete command finishes with exit code `0`. |\n| `build` | The complete command finishes with exit code `0` and produces every required declared artifact during that run; each artifact must exist, be non-empty, and have the expected path/type. Pre-existing stale files do not count. |\n\nAdd a host to `verification` only after complete verification succeeds. Do not add a host after a failure or missing dependency. Do not delete `host_requirements` or the command solely because the current environment is unavailable. Do not remove a compatible host merely because it cannot be tested on the current machine. Do not treat the target platform, target triple, runner name, an installed executable, CI configuration, an intermediate log, or a successful sub-step as proof. Cross-compilation is supported only when the complete toolchain is present on that host and the exact command produces and verifies the target artifact; the presence of `cargo-xwin`, `cross`, or a target triple is not evidence. Remove a command only when no real project-owned entry exists. Omit an action's host field only when the command has actually been established to be host-independent; omission must not mean “not checked”.\n\nSupported host values are `macos`, `windows`, and `linux`. The three actions may use different lists. Atrium disables and rejects a profile action whose declared host list does not include the current host, before starting the process. It also disables an action on a matching host until that host appears in `verification`.\n\n"
        .to_string()
}

fn run_target_rules() -> String {
    "## Run target rules\n\nAudit every existing profile's run binding, even when its host requirement or verification record already passes. Run must start the target represented by that profile's platform and channel. A generic development command that starts a macOS application does not verify a Windows profile's Run. Likewise, a direct-channel application does not verify a store-channel runtime unless the project proves that the runtime behavior is equivalent. Development entries are valid only when the actual runtime matches the profile target.\n\nVerify the running application's platform, channel configuration, and readiness, and record this evidence in the verification matrix and `[build_profiles.verification]`. `host_requirements` declares where the target may run; `verification` records where it actually passed. Only list a host in verification after running on that host. Atrium requires matching host and target systems for Run on macos, windows, and linux desktop profiles. Cross-system desktop Run is not supported, including through compatibility layers or remote launchers. Other targets use their declared host requirements. Being able to build Windows artifacts on macOS does not prove that Windows Run works there. Check and Build retain independent host requirements.\n\nIf no matching project-owned run entry exists, omit Run and explain why. If an entry exists but its target host does not match the current host, preserve the binding and record the verification as deferred. If the target host matches but the command or environment cannot be verified, report the blocker and do not acknowledge synchronization. Do not replace a target-specific entry with a generic local dev command just to pass verification.\n\n".to_string()
}

fn blocker_rules() -> String {
    "## Validation blockers and completion\n\nBefore testing, inspect whether a command depends on fixed ports, background services, credentials, SDKs, or other environment state. Atrium or another external process must not be terminated or reconfigured. If a port is occupied, do not treat the collision itself as proof that the project command fails. Use an alternate port only when the project already supports it through an environment variable, command-line option, or test configuration, and record the actual port in the verification matrix. Do not temporarily edit or commit project configuration just to avoid a collision. A host mismatch is deferred verification and is not an environment blocker; a matching-host failure or unavailable dependency is a blocker. Do not disguise a blocker as unsupported or delete the command binding just to complete synchronization.\n\nChoose the project's real quality gate before running `check`. Do not replace a failed full check with a narrower passing command merely to obtain exit code `0`; a narrower command is valid only when the project already defines it as the explicit scope for that profile, and that scope is reported. Port, dependency, credential, and toolchain failures remain blockers.\n\n"
        .to_string()
}

fn cleanup_rules() -> String {
    "## Cleanup declarations\n\nCleanup declarations are project-owned. Declare the exact cache and build directories that the project Agent has verified are safe to regenerate, including dependency or vendor subdirectories when appropriate; a nested dependency cache such as `node_modules/.vite` may be declared after that project-specific verification. Atrium only enforces that cleanup paths are relative, stay inside the project at execution time, do not traverse symbolic links outside it, and do not target `.git` or `.atrium`; it does not maintain a universal denylist of project directories. Duplicate or nested declarations are rejected only so storage metrics and cleanup targets remain deterministic.\n\n"
        .to_string()
}

fn sync_rules() -> String {
    format!(
        "## Guidance sync acknowledgement\n\n`{GUIDANCE_SYNC_PATH}` acknowledges synchronized guidance. It is a completion acknowledgement, not a partial-progress marker and not a claim that every host was tested on the current machine. Update it when every action applicable to the current host is verified successfully and nonmatching hosts are explicitly deferred or already recorded in `verification`. If a matching-host blocker remains, leave an existing acknowledgement untouched (or do not create one), report the integration as incomplete, and never confirm synchronization by deleting commands, narrowing the check scope, or inventing host support. After applying the manifest changes and updating this managed block, update `{GUIDANCE_SYNC_PATH}` with the current `guidance_revision` and `protocol_schema` values from `.atrium/guidance.toml`. Only write this acknowledgement after the synchronization is complete.\n\n"
    )
}

fn migration_rules() -> String {
    "## Keeping the protocol current\n\nWhen a development task changes the project's icon, supported platforms or channels, Run / Check / Build commands, build artifacts, cleanup directories, or another Atrium protocol field, re-read the current `.atrium/guidance.toml`, `.atrium/manifest.toml`, and relevant project files, and update `.atrium/manifest.toml` so it matches the project's actual current structure. If `.atrium/guidance.toml` contains a newer guidance revision than this managed block, read the latest Atrium guidance reports, apply their migration instructions, and update this managed block to the latest version. Do not invent platforms, channels, commands, artifacts, cleanup paths, or host support. Do not launch, control, or terminate Atrium.\n\n".to_string()
}

fn render_managed_agent_rules() -> String {
    format!(
        r#"## Persistent rule for `AGENTS.md`

Add or update only the marked block below in the repository's `AGENTS.md`. Preserve all unrelated project instructions.

<!-- BEGIN ATRIUM MANAGED RULES -->
Atrium guidance revision: {GUIDANCE_REVISION}

{binding_rules}{host_verification_rules}{run_target_rules}{blocker_rules}{cleanup_rules}{sync_rules}{migration_rules}<!-- END ATRIUM MANAGED RULES -->

"#,
        binding_rules = binding_rules(),
        host_verification_rules = host_verification_rules(),
        run_target_rules = run_target_rules(),
        blocker_rules = blocker_rules(),
        cleanup_rules = cleanup_rules(),
        sync_rules = sync_rules(),
        migration_rules = migration_rules(),
    )
}

fn render_manifest_template() -> String {
    r#"## manifest.toml template

Replace every `<...>` value with a fact verified in the repository. Remove an optional block when it does not apply; do not leave example values in the manifest. Repeat the array blocks for each real platform, channel, or build profile.

```toml
schema = 3

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
# Include only artifacts this profile actually produces. Atrium reports and
# opens exactly these paths and never infers artifacts from framework defaults.
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

# Execution-host restrictions. `platform` above is the artifact target; these
# values are the lower compatibility boundary. Preserve a required host even
# when the current machine cannot test it.
# [build_profiles.host_requirements]
# run = ["macos", "windows"]
# check = ["macos", "windows", "linux"]
# build = ["windows"]

# Hosts where the exact bound command has passed the required verification.
# Add a host only after running on that host and recording the required success
# postcondition. A host omitted here is not automatically unsupported; it may
# simply be waiting for verification on the matching machine.
# [build_profiles.verification]
# run = ["windows"]
# check = ["macos", "windows", "linux"]
# build = ["windows"]

# Installation is not represented by this profile; it is a separate explicit action.

# Optional: include exact project-relative directories that the project Agent
# has verified are safe to regenerate. Dependency/vendor directories are valid
# when the Agent has made that project-specific decision.
[cleanup]
cache = ["<relative cache directory>"]
build = ["<relative build directory>"]

# Optional project-owned tool and link declarations. The terminal is passed to
# the OS as a program path, never as a shell command. Links must be absolute
# http://, https://, or file:// URLs without embedded credentials.
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
        assert!(rules.contains("update `.atrium/manifest.toml`"));
        assert!(rules.contains("primary local runtime entry"));
        assert!(rules.contains("framework-neutral"));
        assert!(rules.contains("installation is a separate, explicit user action"));
        assert!(rules.contains("[build_profiles.host_requirements]"));
        assert!(rules.contains(
            "do not infer either host requirement or verification from the target platform"
        ));
        assert!(rules.contains("lower compatibility boundary"));
        assert!(rules.contains("upper evidence boundary"));
        assert!(rules.contains("Do not remove a compatible host merely"));
        assert!(rules.contains("produces and verifies the target artifact"));
        assert!(rules.contains("fixed ports, background services"));
        assert!(rules.contains("partial-progress marker"));
        assert!(rules.contains("Do not replace a failed full check"));
        assert!(rules.contains("Cleanup declarations are project-owned"));
        assert!(rules.contains("dependency or vendor subdirectories"));
        assert!(rules.contains("do not target `.git` or `.atrium`"));
        assert!(rules.contains("Duplicate or nested declarations"));
        assert!(rules.contains(GUIDANCE_SYNC_PATH));
        assert!(rules.contains("Do not launch, control, or terminate Atrium"));
    }

    #[test]
    fn every_rule_section_appears_once_in_the_managed_block() {
        let rules = render_managed_agent_rules();

        for heading in [
            "## Run / Check / Build command bindings",
            "## Host requirements and verification",
            "## Run target rules",
            "## Validation blockers and completion",
            "## Cleanup declarations",
            "## Guidance sync acknowledgement",
            "## Keeping the protocol current",
        ] {
            assert_eq!(
                rules.matches(heading).count(),
                1,
                "{heading} should appear exactly once"
            );
        }
    }
}
