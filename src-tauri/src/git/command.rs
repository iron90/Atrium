use std::io::{self, Read};
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;

const MAX_GIT_STDOUT_BYTES: usize = 4 * 1024 * 1024;
const MAX_GIT_STDERR_BYTES: usize = 64 * 1024;

pub(super) fn run_git(project_path: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(project_path)
        .args(args)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8(output.stdout).ok()
}

pub(super) fn run_git_required(project_path: &Path, args: &[&str]) -> Result<String, String> {
    let mut child = Command::new("git")
        .arg("-C")
        .arg(project_path)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Cannot run git: {error}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Cannot capture git output".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Cannot capture git errors".to_string())?;
    let stdout_reader = thread::spawn(move || read_limited(stdout, MAX_GIT_STDOUT_BYTES));
    let stderr_reader = thread::spawn(move || read_limited(stderr, MAX_GIT_STDERR_BYTES));
    let status = child
        .wait()
        .map_err(|error| format!("Cannot wait for git: {error}"))?;
    let stdout = stdout_reader
        .join()
        .map_err(|_| "Git output reader failed".to_string())?
        .map_err(|error| format!("Cannot read git output: {error}"))?;
    let stderr = stderr_reader
        .join()
        .map_err(|_| "Git error reader failed".to_string())?
        .map_err(|error| format!("Cannot read git errors: {error}"))?;

    if !status.success() {
        if stderr.truncated {
            return Err(format!(
                "Git command failed; error output exceeded {MAX_GIT_STDERR_BYTES} bytes"
            ));
        }
        return Err(String::from_utf8_lossy(&stderr.bytes).trim().to_string());
    }
    if stdout.truncated {
        return Err(format!(
            "Git output exceeded {MAX_GIT_STDOUT_BYTES} bytes; narrow the selected range"
        ));
    }
    String::from_utf8(stdout.bytes).map_err(|error| format!("Git returned invalid UTF-8: {error}"))
}

struct LimitedOutput {
    bytes: Vec<u8>,
    truncated: bool,
}

fn read_limited<R: Read>(mut reader: R, limit: usize) -> io::Result<LimitedOutput> {
    let mut bytes = Vec::with_capacity(limit.min(8192));
    let mut buffer = [0_u8; 8192];
    let mut truncated = false;
    loop {
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        let remaining = limit.saturating_sub(bytes.len());
        let kept = read.min(remaining);
        bytes.extend_from_slice(&buffer[..kept]);
        truncated |= kept < read;
    }
    Ok(LimitedOutput { bytes, truncated })
}

#[cfg(test)]
mod tests {
    use super::read_limited;
    use std::io::Cursor;

    #[test]
    fn drains_streams_but_retains_only_the_configured_limit() {
        let result = read_limited(Cursor::new(b"123456789"), 4).expect("read bounded stream");

        assert_eq!(result.bytes, b"1234");
        assert!(result.truncated);
    }

    #[test]
    fn preserves_short_streams_without_marking_them_truncated() {
        let result = read_limited(Cursor::new(b"1234"), 4).expect("read bounded stream");

        assert_eq!(result.bytes, b"1234");
        assert!(!result.truncated);
    }
}
