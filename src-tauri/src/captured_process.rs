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
//!
//! An app opened from Finder does not inherit a terminal PATH. On Unix the
//! child therefore receives the user's login-shell PATH, resolved once by a
//! fixed `printf` of `$PATH`. The project command itself is never passed to
//! that shell.

use std::ffi::OsStr;
use std::process::Command;

pub(crate) fn captured_command(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // Win32 CREATE_NO_WINDOW. Stdout and stderr pipes still work.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(unix)]
    apply_login_path(&mut command);
    crate::network_proxy::apply_to_command(&mut command);
    command
}

#[cfg(unix)]
fn apply_login_path(command: &mut Command) {
    if let Some(path) = login_path() {
        command.env("PATH", path);
    }
}

#[cfg(unix)]
fn login_path() -> Option<&'static str> {
    use std::sync::OnceLock;

    static CACHED: OnceLock<Option<String>> = OnceLock::new();
    CACHED.get_or_init(read_login_path).as_deref()
}

#[cfg(unix)]
const LOGIN_PATH_SCRIPT: &str = "printf '\\n__ATRIUM_PATH__%s' \"$PATH\"";

#[cfg(unix)]
fn login_shell() -> std::path::PathBuf {
    if let Some(shell) = std::env::var_os("SHELL") {
        let path = std::path::PathBuf::from(shell);
        if path.is_absolute() && path.is_file() {
            return path;
        }
    }
    std::path::PathBuf::from(if cfg!(target_os = "macos") {
        "/bin/zsh"
    } else {
        "/bin/bash"
    })
}

// The shell is a constant program and a constant script. Its only job is to
// print the user's PATH after a marker. Startup noise stays on other lines.
#[cfg(unix)]
fn read_login_path() -> Option<String> {
    use std::io::Read;
    use std::os::unix::process::CommandExt;
    use std::process::Stdio;
    use std::time::{Duration, Instant};

    let mut command = Command::new(login_shell());
    command
        .args(["-ilc", LOGIN_PATH_SCRIPT])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    // Own process group so a timeout can stop the shell and whatever it started.
    command.process_group(0);
    let mut child = command.spawn().ok()?;
    let stdout = child.stdout.take()?;
    let reader = std::thread::spawn(move || {
        let mut buffer = Vec::new();
        let _ = stdout.take(128 * 1024).read_to_end(&mut buffer);
        buffer
    });
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if started.elapsed() < Duration::from_secs(4) => {
                std::thread::sleep(Duration::from_millis(40));
            }
            _ => {
                stop_process_group(child.id());
                let _ = child.wait();
                break;
            }
        }
    }
    let buffer = reader.join().unwrap_or_default();
    parse_login_path(&String::from_utf8_lossy(&buffer))
}

#[cfg(unix)]
fn stop_process_group(pid: u32) {
    // The child is its own process group leader. A negative pid signals that group.
    let Ok(pid) = i32::try_from(pid) else {
        return;
    };
    if pid <= 0 {
        return;
    }
    unsafe {
        libc::kill(-pid, libc::SIGKILL);
    }
}

#[cfg(unix)]
fn parse_login_path(output: &str) -> Option<String> {
    const MARKER: &str = "__ATRIUM_PATH__";
    let path = output
        .lines()
        .filter_map(|line| line.rsplit_once(MARKER).map(|(_, path)| path.trim()))
        .next_back()?;
    if path.is_empty()
        || path.len() > 64 * 1024
        || path.chars().any(char::is_control)
        || !path.split(':').any(|entry| entry.starts_with('/'))
    {
        return None;
    }
    Some(path.to_string())
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

    #[cfg(unix)]
    #[test]
    fn reads_the_path_that_follows_the_marker() {
        let output = "shell banner\n\n__ATRIUM_PATH__/usr/bin:/opt/homebrew/bin\nprompt % ";
        assert_eq!(
            super::parse_login_path(output).as_deref(),
            Some("/usr/bin:/opt/homebrew/bin")
        );
    }

    #[cfg(unix)]
    #[test]
    fn keeps_the_last_marked_path_and_rejects_noise() {
        let output = "__ATRIUM_PATH__/tmp/early\n__ATRIUM_PATH__/usr/bin:/bin\n";
        assert_eq!(
            super::parse_login_path(output).as_deref(),
            Some("/usr/bin:/bin")
        );
        assert_eq!(super::parse_login_path("welcome\n"), None);
        assert_eq!(super::parse_login_path("__ATRIUM_PATH__\n"), None);
        assert_eq!(
            super::parse_login_path("__ATRIUM_PATH__not-absolute\n"),
            None
        );
    }
}
