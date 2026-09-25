// Kills the whole process tree rooted at `pid`. Repo commands spawn children
// of their own (npm -> vite, sh gradlew -> java), so killing only the direct
// child leaves the real work running.
#[allow(unused_variables)]
pub(crate) fn kill_process_tree(pid: u32) {
    #[cfg(unix)]
    {
        // The child was spawned as its own process group leader, so the
        // negative pid targets every descendant.
        unsafe {
            libc::kill(-(pid as i32), libc::SIGKILL);
        }
    }
    #[cfg(windows)]
    {
        use std::process::{Command, Stdio};
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

#[cfg(test)]
mod tests {
    use super::kill_process_tree;

    #[test]
    fn killing_an_unknown_pid_is_harmless() {
        kill_process_tree(u32::MAX - 7);
    }
}
