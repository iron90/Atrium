//! Guards on the project-owned Install command.
//!
//! Install is the one bound action that changes the machine rather than a
//! build output directory, so it carries the risk the other actions do not.
//! The guidance tells the project development Agent the rules; this module
//! makes sure a manifest that ignores them cannot silently reach the user's
//! machine. Atrium still never invents or wraps the command — it only refuses
//! a binding that is plainly out of bounds.

use crate::model::ProjectCommand;

/// Programs that escalate privileges or install outside the project.
const SYSTEM_PROGRAMS: [&str; 6] = ["sudo", "doas", "su", "brew", "apt", "apt-get"];

/// Flags that move an install out of the project or into a shared location.
const SYSTEM_SCOPE_FLAGS: [&str; 6] =
    ["--global", "-g", "--system", "--user", "--prefix", "--root"];

pub(crate) fn project_local(command: &ProjectCommand) -> Result<(), String> {
    let program = basename(&command.program);
    if SYSTEM_PROGRAMS.contains(&program.as_str()) {
        return Err(format!(
            "Install is bound to `{}`, which changes the machine outside the project. Bind the project's own dependency restore command.",
            command.display_command
        ));
    }
    if let Some(flag) = command
        .args
        .iter()
        .find(|argument| SYSTEM_SCOPE_FLAGS.contains(&argument.as_str()))
    {
        return Err(format!(
            "Install uses `{flag}`, which installs outside the project. Bind the project's own dependency restore command."
        ));
    }
    Ok(())
}

fn basename(program: &str) -> String {
    program
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(program)
        .trim_end_matches(".exe")
        .to_ascii_lowercase()
}

#[cfg(test)]
mod tests {
    use super::project_local;
    use crate::model::ProjectCommand;

    fn command(program: &str, args: &[&str]) -> ProjectCommand {
        ProjectCommand {
            id: "npm:ci".to_string(),
            kind: crate::model::CommandKind::Install,
            label: "Install".to_string(),
            program: program.to_string(),
            args: args.iter().map(|arg| arg.to_string()).collect(),
            working_directory: "/repo".to_string(),
            display_command: format!("{program} {}", args.join(" ")).trim().to_string(),
            source: "package.json".to_string(),
        }
    }

    #[test]
    fn accepts_a_project_local_restore() {
        assert!(project_local(&command("npm", &["ci"])).is_ok());
        assert!(project_local(&command("/usr/local/bin/uv", &["sync", "--frozen"])).is_ok());
        assert!(project_local(&command(
            "C:\\tools\\python.exe",
            &["-m", "pip", "install", "-r", "requirements.txt"]
        ))
        .is_ok());
    }

    #[test]
    fn refuses_privilege_escalation() {
        for program in ["sudo", "/usr/bin/sudo", "brew", "apt-get"] {
            let error = project_local(&command(program, &["npm", "ci"]))
                .expect_err("a system program must be refused");
            assert!(error.contains("outside the project"), "{error}");
        }
    }

    #[test]
    fn refuses_system_and_user_scope_flags() {
        for args in [
            vec!["install", "--global", "left-pad"],
            vec!["install", "-g", "left-pad"],
            vec!["install", "--user", "left-pad"],
            vec!["install", "--prefix", "/usr/local"],
        ] {
            assert!(
                project_local(&command("npm", &args)).is_err(),
                "{args:?} must be refused"
            );
        }
    }
}
