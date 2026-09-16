use std::collections::HashMap;
use std::path::Path;

use crate::model::{GitChangeSummary, GitCommit, GitFileChange};

use super::command::run_git_required;
use super::commit::parse_commit_records;

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
