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
        use std::process::Stdio;

        use crate::captured_process::captured_command;
        let _ = captured_command("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
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
