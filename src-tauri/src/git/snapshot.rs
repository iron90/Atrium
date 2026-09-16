use std::path::Path;

use crate::model::{GitCommit, GitReference, GitReferenceKind, GitSnapshot};

use super::command::run_git;
use super::commit::parse_commit_records;

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
    );
    let remote = run_git(project_path, &["remote", "get-url", "origin"])
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let recent_commits = read_commits(project_path);
    let references = read_references(project_path);
    let (ahead, behind) = read_tracking_counts(project_path);
    let (is_clean, worktree_changes, worktree_status_available) =
        worktree_status(status.as_deref());

    Some(GitSnapshot {
        branch,
        is_clean,
        worktree_changes,
        worktree_status_available,
        remote,
        ahead,
        behind,
        last_commit: recent_commits.first().cloned(),
        recent_commits,
        references,
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
    parse_commit_records(&raw)
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

fn worktree_status(status: Option<&str>) -> (bool, u32, bool) {
    match status {
        Some(status) => (
            status.trim().is_empty(),
            count_worktree_changes(status),
            true,
        ),
        None => (false, 0, false),
    }
}

#[cfg(test)]
mod tests {
    use super::{count_worktree_changes, read_tracking_counts, worktree_status};
    use std::path::Path;

    #[test]
    fn missing_upstream_is_not_an_error() {
        assert_eq!(
            read_tracking_counts(Path::new("/definitely/missing")),
            (None, None)
        );
    }

    #[test]
    fn counts_staged_unstaged_and_untracked_status_entries() {
        let status = " M src/App.tsx\nA  src/new.ts\n?? notes.txt\n";
        assert_eq!(count_worktree_changes(status), 3);
    }

    #[test]
    fn does_not_treat_unavailable_worktree_status_as_clean() {
        assert_eq!(worktree_status(None), (false, 0, false));
        assert_eq!(worktree_status(Some("")), (true, 0, true));
    }
}
