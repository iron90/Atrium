use std::path::Path;

use crate::model::{GitBranchOverview, GitCommit, GitReference, GitReferenceKind, GitSnapshot};

use super::command::run_git;
use super::commit::parse_commit_records;

pub fn read_git_snapshot(project_path: &Path) -> Option<GitSnapshot> {
    let inside = run_git(project_path, &["rev-parse", "--is-inside-work-tree"])?;
    if inside.trim() != "true" {
        return None;
    }

    let branch = branch_from_command_output(run_git(project_path, &["branch", "--show-current"]));

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

fn branch_from_command_output(output: Option<String>) -> Option<String> {
    let value = output?.trim().to_string();
    if value.is_empty() {
        return Some("(detached HEAD)".to_string());
    }
    Some(value)
}

fn read_commits(project_path: &Path) -> Vec<GitCommit> {
    read_commits_at(project_path, None)
}

// The branch overview reads a ref's history without touching the worktree:
// no checkout, no ref updates — only read-only log/rev-list commands.
pub fn read_branch_overview(project_path: &Path, branch: &str) -> Option<GitBranchOverview> {
    let commits = read_commits_at(project_path, Some(branch));
    let raw = run_git(
        project_path,
        &[
            "rev-list",
            "--left-right",
            "--count",
            &format!("HEAD...{branch}"),
        ],
    )?;
    let fields: Vec<&str> = raw.split_whitespace().collect();
    if fields.len() != 2 {
        return None;
    }
    // Left side counts commits only HEAD has (HEAD is ahead), the right side
    // counts commits only the branch has (the branch is ahead).
    let behind_head = fields[0].parse().ok()?;
    let ahead_of_head = fields[1].parse().ok()?;
    Some(GitBranchOverview {
        branch: branch.to_string(),
        commits,
        ahead_of_head,
        behind_head,
    })
}

fn read_commits_at(project_path: &Path, rev: Option<&str>) -> Vec<GitCommit> {
    let format = "%H%x1f%h%x1f%an%x1f%ct%x1f%s%x1e";
    let mut args = vec![
        "log".to_string(),
        "-n".to_string(),
        "12".to_string(),
        "--date-order".to_string(),
        format!("--format={format}"),
    ];
    if let Some(rev) = rev {
        args.push(rev.to_string());
    }
    args.push("--".to_string());
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let Some(raw) = run_git(project_path, &arg_refs) else {
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
        // for-each-ref does not expand log's %xNN hex escapes (git 2.52
        // prints them literally), so the fields are separated with a literal
        // tab — git forbids whitespace in refnames, so the split is unambiguous.
        let Some(raw) = run_git(
            project_path,
            &[
                "for-each-ref",
                "--format=%(refname:short)\t%(objectname:short)",
                namespace,
            ],
        ) else {
            continue;
        };
        references.extend(raw.lines().filter_map(|record| {
            let fields: Vec<&str> = record.split('\t').collect();
            if fields.len() != 2 || fields[0].is_empty() {
                return None;
            }
            Some(GitReference {
                name: fields[0].to_string(),
                kind,
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
    use super::{
        branch_from_command_output, count_worktree_changes, read_branch_overview,
        read_git_snapshot, read_tracking_counts, worktree_status, GitReferenceKind,
    };
    use std::fs;
    use std::path::Path;
    use std::process::Command;

    fn git_command() -> Command {
        // The git-environment isolation test mutates process-wide GIT_*
        // variables while tests run in parallel; fixture git calls must not
        // inherit them.
        let mut command = Command::new("git");
        for (variable, _) in std::env::vars_os() {
            if variable.to_string_lossy().starts_with("GIT_") {
                command.env_remove(&variable);
            }
        }
        command
    }

    fn git(root: &Path, args: &[&str]) {
        let status = git_command()
            .arg("-C")
            .arg(root)
            .args(args)
            .status()
            .expect("run git");
        assert!(status.success(), "git {args:?} failed");
    }

    fn fixture_repo(name: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!(
            "atrium-branch-overview-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create fixture repo");
        git(&root, &["init", "-q"]);
        git(&root, &["config", "user.email", "atrium@example.com"]);
        git(&root, &["config", "user.name", "Atrium Test"]);
        root
    }

    #[test]
    fn reads_a_branch_history_and_position_relative_to_head() {
        let root = fixture_repo("overview");
        fs::write(root.join("base.txt"), "base\n").expect("write base file");
        git(&root, &["add", "-A"]);
        git(&root, &["commit", "-qm", "base"]);
        git(&root, &["checkout", "-qb", "feature"]);
        fs::write(root.join("feature.txt"), "feature\n").expect("write feature file");
        git(&root, &["add", "-A"]);
        git(&root, &["commit", "-qm", "feature work"]);
        git(&root, &["checkout", "-q", "-"]);
        fs::write(root.join("main-only.txt"), "main\n").expect("write main file");
        git(&root, &["add", "-A"]);
        git(&root, &["commit", "-qm", "main work"]);

        let overview = read_branch_overview(&root, "feature").expect("branch overview");

        assert_eq!(overview.branch, "feature");
        assert_eq!(overview.ahead_of_head, 1, "the feature commit is ahead");
        assert_eq!(overview.behind_head, 1, "the main commit is behind");
        assert!(overview
            .commits
            .iter()
            .any(|commit| commit.subject == "feature work"));
        assert!(!overview
            .commits
            .iter()
            .any(|commit| commit.subject == "main work"));

        fs::remove_dir_all(root).expect("remove fixture repo");
    }

    #[test]
    fn rejects_branches_that_do_not_resolve() {
        let root = fixture_repo("missing");
        fs::write(root.join("base.txt"), "base\n").expect("write base file");
        git(&root, &["add", "-A"]);
        git(&root, &["commit", "-qm", "base"]);

        assert!(read_branch_overview(&root, "no-such-branch").is_none());

        fs::remove_dir_all(root).expect("remove fixture repo");
    }

    #[test]
    fn empty_branch_output_is_detached_head_not_a_failure() {
        assert_eq!(
            branch_from_command_output(Some("\n".to_string())),
            Some("(detached HEAD)".to_string())
        );
    }

    #[test]
    fn failed_branch_command_is_unknown_not_detached_head() {
        assert_eq!(branch_from_command_output(None), None);
    }

    #[test]
    fn trims_successful_branch_output() {
        assert_eq!(
            branch_from_command_output(Some("  main\n".to_string())),
            Some("main".to_string())
        );
    }

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

    // Regression guard: for-each-ref does not expand log's %xNN hex escapes,
    // so the reference fields must be separated without them.
    #[test]
    fn reads_branch_and_tag_references_through_real_git() {
        let root = fixture_repo("references");
        fs::write(root.join("base.txt"), "base\n").expect("write base file");
        git(&root, &["add", "-A"]);
        git(&root, &["commit", "-qm", "base"]);
        git(&root, &["branch", "feature/one"]);
        git(&root, &["tag", "v0.1.0"]);

        let snapshot = read_git_snapshot(&root).expect("git snapshot");

        let current = snapshot.branch.clone().expect("current branch");
        let mut branch_names: Vec<&str> = snapshot
            .references
            .iter()
            .filter(|reference| reference.kind == GitReferenceKind::Branch)
            .map(|reference| reference.name.as_str())
            .collect();
        branch_names.sort_unstable();
        assert_eq!(branch_names, ["feature/one", current.as_str()]);
        assert!(snapshot.references.iter().any(|reference| {
            reference.kind == GitReferenceKind::Tag && reference.name == "v0.1.0"
        }));

        fs::remove_dir_all(root).expect("remove fixture repo");
    }
}
