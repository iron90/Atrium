//! Starts a child process whose output Atrium captures.
//!
//! Release builds are a GUI subsystem app (`windows_subsystem = "windows"` in
//! `main.rs`), so they have no console to hand to a child. Windows then
//! allocates a new console for every console-subsystem program (`git.exe`,
//! `npm`, `cargo`, …) and the window flashes. Every business command whose
//! output stays inside Atrium must start here, so a new call site cannot
//! forget that flag.
//!
//! A launch the user asked to see — a terminal, Explorer — stays on
//! `Command::new` and must not come through this function.

use std::ffi::OsStr;
use std::process::Command;

pub(crate) fn captured_command(program: impl AsRef<OsStr>) -> Command {
    #[cfg_attr(not(windows), allow(unused_mut))]
    let mut command = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // Win32 CREATE_NO_WINDOW. Stdout and stderr pipes still work.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

#[cfg(test)]
mod tests {
    use super::captured_command;

    #[test]
    fn a_captured_child_still_runs() {
        let status = captured_command("git")
            .arg("--version")
            .status()
            .expect("git --version");
        assert!(status.success());
    }
}
