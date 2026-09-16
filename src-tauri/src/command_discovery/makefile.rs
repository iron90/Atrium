use std::fs;
use std::path::Path;

use super::common::{command, command_label, executable, is_safe_command_name};
use crate::model::{CommandKind, ProjectCommand};

pub(super) fn detect_commands(path: &Path, commands: &mut Vec<ProjectCommand>) {
    let makefile = path.join("Makefile");
    let Ok(content) = fs::read_to_string(&makefile) else {
        return;
    };
    let mut targets = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('#') || line.starts_with('\t') || !trimmed.ends_with(':') {
            continue;
        }
        let target = trimmed.trim_end_matches(':').trim();
        if !is_safe_command_name(target) || target.contains('%') {
            continue;
        }
        targets.push(target.to_string());
    }
    for target in targets.into_iter().take(12) {
        let kind = if ["run", "dev", "start"].contains(&target.as_str()) {
            CommandKind::Run
        } else if ["check", "test", "lint"].contains(&target.as_str()) {
            CommandKind::Check
        } else if ["build", "package"].contains(&target.as_str()) {
            CommandKind::Build
        } else {
            CommandKind::Other
        };
        if commands
            .iter()
            .any(|existing| existing.id == format!("make:{target}"))
        {
            continue;
        }
        let label = command_label(&kind, &format!("make {target}"));
        commands.push(command(
            &format!("make:{target}"),
            kind,
            &label,
            executable("make"),
            vec![target.clone()],
            path,
            "Makefile",
            &format!("make {target}"),
        ));
    }
}
