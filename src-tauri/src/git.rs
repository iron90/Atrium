use std::collections::HashMap;
use std::path::Path;
use std::process::Command;

use crate::model::{
    GitChangeSummary, GitCommit, GitFileChange, GitReference, GitReferenceKind, GitSnapshot,
};

pub fn read_git_snapshot(project_path: &Path) -> Option<GitSnapshot> {
    let inside = run_git(project_path, &["rev-parse", "--is-inside-work-tree"])?;
    if inside.trim() != "true" {
        return None;
    }

    let branch = run_git(project_path, &["branch", "--show-current"])
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| Some("(detached HEAD)".to_string()));

    let status = run_git(
        project_path,
        &["status", "--porcelain", "--untracked-files=all"],
    )
    .unwrap_or_default();
    let remote = run_git(project_path, &["remote", "get-url", "origin"])
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let recent_commits = read_commits(project_path);
    let references = read_references(project_path);
    let (ahead, behind) = read_tracking_counts(project_path);

    Some(GitSnapshot {
        branch,
        is_clean: status.trim().is_empty(),
        worktree_changes: count_worktree_changes(&status),
        remote,
        ahead,
        behind,
        last_commit: recent_commits.first().cloned(),
        recent_commits,
        references,
    })
}

pub fn read_git_change_summary(
    project_path: &Path,
    from: &str,
    to: Option<&str>,
) -> Result<GitChangeSummary, String> {
    let from = validate_revision(from)?;
    let to = validate_revision(to.unwrap_or("HEAD"))?;
    let range = format!("{from}..{to}");
    let commits = read_commits_range(project_path, &range)?;
    let files = read_changed_files(project_path, &from, &to)?;
    let insertions = files.iter().filter_map(|file| file.additions).sum::<u64>();
    let deletions = files.iter().filter_map(|file| file.deletions).sum::<u64>();

    Ok(GitChangeSummary {
        project_path: project_path.to_string_lossy().to_string(),
        from,
        to,
        commits,
        files,
        insertions,
        deletions,
    })
}

fn read_commits(project_path: &Path) -> Vec<GitCommit> {
    let format = "%H%x1f%h%x1f%an%x1f%ct%x1f%s%x1e";
    let Some(raw) = run_git(
        project_path,
        &[
            "log",
            "-n",
            "12",
            "--date-order",
            &format!("--format={format}"),
        ],
    ) else {
        return Vec::new();
    };

    raw.split('\u{1e}')
        .filter_map(|record| {
            let fields: Vec<&str> = record.trim().split('\u{1f}').collect();
            if fields.len() != 5 {
                return None;
            }
            Some(GitCommit {
                sha: fields[0].to_string(),
                short_sha: fields[1].to_string(),
                author: fields[2].to_string(),
                timestamp: git_timestamp_millis(fields[3]),
                subject: fields[4].to_string(),
            })
        })
        .collect()
}

fn read_commits_range(project_path: &Path, range: &str) -> Result<Vec<GitCommit>, String> {
    let format = "%H%x1f%h%x1f%an%x1f%ct%x1f%s%x1e";
    let raw = run_git_required(
        project_path,
        &[
            "log",
            "--date-order",
            &format!("--format={format}"),
            range,
            "--",
        ],
    )?;
    Ok(parse_commit_records(&raw))
}

fn parse_commit_records(raw: &str) -> Vec<GitCommit> {
    raw.split('\u{1e}')
        .filter_map(|record| {
            let fields: Vec<&str> = record.trim().split('\u{1f}').collect();
            if fields.len() != 5 {
                return None;
            }
            Some(GitCommit {
                sha: fields[0].to_string(),
                short_sha: fields[1].to_string(),
                author: fields[2].to_string(),
                timestamp: git_timestamp_millis(fields[3]),
                subject: fields[4].to_string(),
            })
        })
        .collect()
}

fn read_changed_files(
    project_path: &Path,
    from: &str,
    to: &str,
) -> Result<Vec<GitFileChange>, String> {
    let numstat = run_git_required(project_path, &["diff", "--numstat", from, to, "--"])?;
    let statuses = run_git_required(project_path, &["diff", "--name-status", from, to, "--"])?;
    let mut status_by_path = HashMap::new();
    for line in statuses.lines() {
        let mut fields = line.splitn(2, '\t');
        let Some(status) = fields.next() else {
            continue;
        };
        let Some(path) = fields.next() else { continue };
        status_by_path.insert(path.to_string(), status.to_string());
    }

    let mut files = Vec::new();
    for line in numstat.lines() {
        let mut fields = line.splitn(3, '\t');
        let Some(additions) = fields.next() else {
            continue;
        };
        let Some(deletions) = fields.next() else {
            continue;
        };
        let Some(path) = fields.next() else { continue };
        files.push(GitFileChange {
            path: path.to_string(),
            status: status_by_path
                .remove(path)
                .unwrap_or_else(|| "M".to_string()),
            additions: additions.parse().ok(),
            deletions: deletions.parse().ok(),
        });
    }
    for (path, status) in status_by_path {
        files.push(GitFileChange {
            path,
            status,
            additions: None,
            deletions: None,
        });
    }
    files.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(files)
}

fn read_references(project_path: &Path) -> Vec<GitReference> {
    let mut references = Vec::new();
    for (kind, namespace) in [
        (GitReferenceKind::Branch, "refs/heads"),
        (GitReferenceKind::Tag, "refs/tags"),
    ] {
        let Some(raw) = run_git(
            project_path,
            &[
                "for-each-ref",
                "--format=%(refname:short)%x1f%(objectname:short)%x1e",
                namespace,
            ],
        ) else {
            continue;
        };
        references.extend(raw.split('\u{1e}').filter_map(|record| {
            let fields: Vec<&str> = record.trim().split('\u{1f}').collect();
            if fields.len() != 2 || fields[0].is_empty() {
                return None;
            }
            Some(GitReference {
                name: fields[0].to_string(),
                kind: kind.clone(),
                sha: Some(fields[1].to_string()),
            })
        }));
    }
    references.sort_by(|left, right| left.name.cmp(&right.name));
    references
}

fn validate_revision(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value.starts_with('-') || value.len() > 256 {
        return Err("Git revision must be a non-empty safe revision name".to_string());
    }
    if value
        .chars()
        .any(|character| character.is_control() || character.is_whitespace())
    {
        return Err("Git revision cannot contain whitespace or control characters".to_string());
    }
    Ok(value.to_string())
}

fn git_timestamp_millis(value: &str) -> i64 {
    value
        .parse::<i64>()
        .unwrap_or_default()
        .saturating_mul(1_000)
}

fn read_tracking_counts(project_path: &Path) -> (Option<u32>, Option<u32>) {
    let Some(raw) = run_git(
        project_path,
        &["rev-list", "--left-right", "--count", "@{upstream}...HEAD"],
    ) else {
        return (None, None);
    };
    let fields: Vec<&str> = raw.split_whitespace().collect();
    if fields.len() != 2 {
        return (None, None);
    }
    let behind = fields[0].parse().ok();
    let ahead = fields[1].parse().ok();
    (ahead, behind)
}

fn count_worktree_changes(status: &str) -> u32 {
    status
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count()
        .try_into()
        .unwrap_or(u32::MAX)
}

fn run_git(project_path: &Path, args: &[&str]) -> Option<String> {
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

fn run_git_required(project_path: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(project_path)
        .args(args)
        .output()
        .map_err(|error| format!("Cannot run git: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    String::from_utf8(output.stdout).map_err(|error| format!("Git returned invalid UTF-8: {error}"))
}

#[cfg(test)]
mod tests {
    use super::{count_worktree_changes, git_timestamp_millis, read_tracking_counts};
    use std::path::Path;

    #[test]
    fn missing_upstream_is_not_an_error() {
        assert_eq!(
            read_tracking_counts(Path::new("/definitely/missing")),
            (None, None)
        );
    }

    #[test]
    fn converts_git_seconds_to_ui_milliseconds() {
        assert_eq!(git_timestamp_millis("1700000000"), 1_700_000_000_000);
    }

    #[test]
    fn counts_staged_unstaged_and_untracked_status_entries() {
        let status = " M src/App.tsx\nA  src/new.ts\n?? notes.txt\n";
        assert_eq!(count_worktree_changes(status), 3);
    }
}
