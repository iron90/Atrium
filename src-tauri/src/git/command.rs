use std::io::{self, Read};
use std::path::Path;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const MAX_GIT_STDOUT_BYTES: usize = 4 * 1024 * 1024;
const MAX_GIT_STDERR_BYTES: usize = 64 * 1024;
// A wedged git call (for example on a stalled network mount) must not block
// scans or runs forever; the process is killed and the fact degrades.
const GIT_TIMEOUT: Duration = Duration::from_secs(30);

pub(super) fn run_git(project_path: &Path, args: &[&str]) -> Option<String> {
    let output = run_git_process(project_path, args).ok()?;
    if !output.status.success() || output.stdout.truncated || output.stderr.truncated {
        return None;
    }
    String::from_utf8(output.stdout.bytes).ok()
}

pub(super) fn run_git_required(project_path: &Path, args: &[&str]) -> Result<String, String> {
    let output = run_git_process(project_path, args)?;

    if !output.status.success() {
        if output.stderr.truncated {
            return Err(format!(
                "Git command failed; error output exceeded {MAX_GIT_STDERR_BYTES} bytes"
            ));
        }
        return Err(String::from_utf8_lossy(&output.stderr.bytes)
            .trim()
            .to_string());
    }
    if output.stdout.truncated {
        return Err(format!(
            "Git output exceeded {MAX_GIT_STDOUT_BYTES} bytes; narrow the selected range"
        ));
    }
    String::from_utf8(output.stdout.bytes)
        .map_err(|error| format!("Git returned invalid UTF-8: {error}"))
}

struct GitProcessOutput {
    status: std::process::ExitStatus,
    stdout: LimitedOutput,
    stderr: LimitedOutput,
}

fn run_git_process(project_path: &Path, args: &[&str]) -> Result<GitProcessOutput, String> {
    let mut command = Command::new("git");
    command
        // Atrium only observes repositories: optional locks make `git status`
        // write index/untracked-cache updates, and repo-local fsmonitor or
        // untracked-cache config can spawn daemons or write cache files.
        .arg("--no-optional-locks")
        .arg("-c")
        .arg("core.fsmonitor=false")
        .arg("-c")
        .arg("core.untrackedCache=false")
        .arg("-C")
        .arg(project_path)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // Inherited GIT_* variables (GIT_DIR, GIT_WORK_TREE, ...) would redirect
    // git at repositories outside the scanned project.
    for (variable, _) in std::env::vars_os() {
        if variable.to_string_lossy().starts_with("GIT_") {
            command.env_remove(&variable);
        }
    }
    let mut child = command
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
    let status = wait_with_timeout(&mut child, GIT_TIMEOUT)?;
    let stdout = stdout_reader
        .join()
        .map_err(|_| "Git output reader failed".to_string())?
        .map_err(|error| format!("Cannot read git output: {error}"))?;
    let stderr = stderr_reader
        .join()
        .map_err(|_| "Git error reader failed".to_string())?
        .map_err(|error| format!("Cannot read git errors: {error}"))?;

    Ok(GitProcessOutput {
        status,
        stdout,
        stderr,
    })
}

fn wait_with_timeout(child: &mut Child, timeout: Duration) -> Result<ExitStatus, String> {
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Ok(status),
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    // A process stuck in an uninterruptible syscall can ignore
                    // SIGKILL; give up reaping instead of blocking the caller
                    // forever. The reader threads are abandoned with it.
                    for _ in 0..4 {
                        if child
                            .try_wait()
                            .map(|exited| exited.is_some())
                            .unwrap_or(true)
                        {
                            break;
                        }
                        thread::sleep(Duration::from_millis(25));
                    }
                    return Err(format!(
                        "Git command timed out after {} seconds",
                        timeout.as_secs()
                    ));
                }
                thread::sleep(Duration::from_millis(25));
            }
            Err(error) => return Err(format!("Cannot wait for git: {error}")),
        }
    }
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
    use super::{read_limited, run_git, wait_with_timeout};
    use std::fs;
    use std::io::Cursor;
    use std::process::Command;
    use std::time::{Duration, Instant};

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

    #[cfg(unix)]
    #[test]
    fn times_out_a_hung_child_process() {
        let started = Instant::now();
        let mut child = Command::new("sleep")
            .arg("5")
            .spawn()
            .expect("spawn sleep process");

        let result = wait_with_timeout(&mut child, Duration::from_millis(100));

        assert!(result.is_err(), "a hung child must time out");
        assert!(
            started.elapsed() < Duration::from_secs(2),
            "timeout must not wait for the child to finish"
        );
    }

    #[test]
    fn ignores_inherited_git_environment_variables() {
        let root = std::env::temp_dir().join(format!("atrium-git-env-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create fixture repo");
        run_git(&root, &["init"]).expect("git init");
        run_git(&root, &["config", "user.email", "atrium@example.com"]).expect("git config email");
        run_git(&root, &["config", "user.name", "Atrium Test"]).expect("git config name");
        fs::write(root.join("file.txt"), "content\n").expect("write file");
        run_git(&root, &["add", "."]).expect("git add");
        run_git(&root, &["commit", "-m", "init", "file.txt"]).expect("git commit");

        // If GIT_DIR were inherited, git would inspect the empty directory
        // below instead of the fixture repository and return no log output.
        let unrelated = root.join("unrelated");
        fs::create_dir_all(&unrelated).expect("create unrelated directory");
        std::env::set_var("GIT_DIR", &unrelated);

        let log = run_git(&root, &["log", "--oneline", "-n", "1"]);

        std::env::remove_var("GIT_DIR");
        let log = log.expect("log should use the repository, not the inherited GIT_DIR");
        assert!(log.contains("init"), "log: {log}");

        fs::remove_dir_all(root).expect("remove fixture repo");
    }
}
