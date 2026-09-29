use std::collections::HashMap;
use std::path::Path;

use crate::model::{GitChangeSummary, GitCommit, GitFileChange};

use super::command::run_git_required;
use super::commit::parse_commit_records;

const MAX_REVISION_LENGTH: usize = 256;

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
    // -z output is NUL-separated and never quotes paths, so non-ASCII names
    // and rename source/destination pairs arrive verbatim.
    let numstat = run_git_required(project_path, &["diff", "--numstat", "-z", from, to, "--"])?;
    let statuses = run_git_required(
        project_path,
        &["diff", "--name-status", "-z", from, to, "--"],
    )?;
    let mut status_by_path = parse_name_status_records(&statuses);

    let mut files = Vec::new();
    for (path, additions, deletions) in parse_numstat_records(&numstat) {
        let status = status_by_path
            .remove(&path)
            .unwrap_or_else(|| "M".to_string());
        files.push(GitFileChange {
            path,
            status,
            additions,
            deletions,
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

// numstat -z emits `added\tdeleted\t` followed by one NUL-terminated path, or
// for renames by an empty field, the source path, and the destination path,
// each NUL-terminated (verified against git output).
fn parse_numstat_records(raw: &str) -> Vec<(String, Option<u64>, Option<u64>)> {
    let fields: Vec<&str> = raw.split('\0').collect();
    let mut records = Vec::new();
    let mut index = 0;
    while index < fields.len() {
        let record = fields[index];
        index += 1;
        if record.is_empty() {
            continue;
        }
        let mut parts = record.splitn(3, '\t');
        let Some(additions) = parts.next().and_then(|value| value.parse().ok()) else {
            continue;
        };
        let Some(deletions) = parts.next().and_then(|value| value.parse().ok()) else {
            continue;
        };
        let Some(first_path) = parts.next() else {
            continue;
        };
        if first_path.is_empty() {
            // Rename record: the destination path is what survives the change.
            if index + 1 < fields.len()
                && !fields[index].is_empty()
                && !fields[index + 1].is_empty()
            {
                records.push((
                    fields[index + 1].to_string(),
                    Some(additions),
                    Some(deletions),
                ));
                index += 2;
            }
            continue;
        }
        records.push((first_path.to_string(), Some(additions), Some(deletions)));
    }
    records
}

// name-status -z emits a status token followed by one path, or for
// copies/renames (X100-style tokens) by source and destination paths.
fn parse_name_status_records(raw: &str) -> HashMap<String, String> {
    let fields: Vec<&str> = raw.split('\0').collect();
    let mut statuses = HashMap::new();
    let mut index = 0;
    while index < fields.len() {
        let status = fields[index];
        index += 1;
        if status.is_empty() {
            continue;
        }
        let is_pair = status.starts_with('R') || status.starts_with('C');
        let Some(path) = fields.get(index + if is_pair { 1 } else { 0 }) else {
            break;
        };
        let key = if is_pair { *path } else { path };
        if !key.is_empty() {
            statuses.insert(key.to_string(), status.to_string());
        }
        index += if is_pair { 2 } else { 1 };
    }
    statuses
}

pub(crate) fn validate_revision(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value.starts_with('-') || value.len() > MAX_REVISION_LENGTH {
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

#[cfg(test)]
mod tests {
    use super::{
        parse_name_status_records, parse_numstat_records, read_git_change_summary,
        validate_revision,
    };
    use std::fs;
    use std::process::Command;

    fn init_repo(name: &str) -> std::path::PathBuf {
        let root =
            std::env::temp_dir().join(format!("atrium-git-summary-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create fixture repo");
        let git = |args: &[&str]| {
            let status = Command::new("git")
                .arg("-C")
                .arg(&root)
                .args(args)
                .status()
                .expect("run git");
            assert!(status.success(), "git {args:?} failed");
        };
        git(&["init", "-q"]);
        git(&["config", "user.email", "atrium@example.com"]);
        git(&["config", "user.name", "Atrium Test"]);
        root
    }

    #[test]
    fn parses_rename_and_cjk_paths_from_nul_separated_git_output() {
        let nul = "\x00";
        let numstat = [
            "2\t0\t",
            nul,
            "src/old.txt",
            nul,
            "src/\u{65b0}.txt",
            nul,
            "4\t0\t文档 新.txt",
            nul,
            "0\t2\t文档 旧.txt",
            nul,
        ]
        .concat();
        let statuses = [
            "R100",
            nul,
            "src/old.txt",
            nul,
            "src/\u{65b0}.txt",
            nul,
            "A",
            nul,
            "文档 新.txt",
            nul,
            "D",
            nul,
            "文档 旧.txt",
            nul,
        ]
        .concat();

        let records = parse_numstat_records(&numstat);
        assert_eq!(
            records,
            vec![
                ("src/\u{65b0}.txt".to_string(), Some(2), Some(0)),
                ("文档 新.txt".to_string(), Some(4), Some(0)),
                ("文档 旧.txt".to_string(), Some(0), Some(2)),
            ]
        );
        let statuses_by_path = parse_name_status_records(&statuses);
        assert_eq!(
            statuses_by_path.get("src/\u{65b0}.txt").map(String::as_str),
            Some("R100")
        );
        assert_eq!(
            statuses_by_path.get("文档 新.txt").map(String::as_str),
            Some("A")
        );
    }

    #[test]
    fn skips_malformed_numstat_fields_instead_of_emitting_empty_paths() {
        let nul = "\x00";
        let numstat = ["x\ty\tbroken", nul, nul, "3\t1\treal.txt", nul].concat();

        let records = parse_numstat_records(&numstat);

        assert_eq!(records, vec![("real.txt".to_string(), Some(3), Some(1))]);
    }

    #[test]
    fn summarizes_renames_and_non_ascii_paths_from_a_real_repository() {
        let root = init_repo("renames");
        fs::write(root.join("文件 甲.txt"), "line\n").expect("write CJK file");
        fs::create_dir_all(root.join("src")).expect("create src");
        fs::write(root.join("src/old.txt"), "kept\n").expect("write old");
        let git = |args: &[&str]| {
            assert!(Command::new("git")
                .arg("-C")
                .arg(&root)
                .args(args)
                .status()
                .expect("run git")
                .success());
        };
        git(&["add", "-A"]);
        git(&["commit", "-qm", "init"]);
        git(&["mv", "src/old.txt", "src/新.txt"]);
        git(&["commit", "-qm", "rename"]);
        fs::write(root.join("src/新.txt"), "kept\nmore\n").expect("edit renamed file");
        git(&["add", "-A"]);
        git(&["commit", "-qm", "edit"]);

        let summary =
            read_git_change_summary(&root, "HEAD~2", Some("HEAD")).expect("summarize changes");

        let renamed = summary
            .files
            .iter()
            .find(|file| file.path == "src/新.txt")
            .expect("renamed destination path is reported");
        assert!(
            renamed.status.starts_with('R'),
            "rename status, got {}",
            renamed.status
        );
        assert_eq!(renamed.additions, Some(1));
        // The rename destination arrives verbatim: no tab-joined pair, no
        // octal-escaped CJK bytes.
        assert!(summary.files.iter().all(|file| !file.path.contains('\t')));

        fs::remove_dir_all(root).expect("remove fixture repo");
    }

    #[test]
    fn accepts_revision_names_and_trims_outer_whitespace() {
        assert_eq!(validate_revision(" HEAD ").unwrap(), "HEAD");
        assert_eq!(validate_revision("feature/demo").unwrap(), "feature/demo");
    }

    #[test]
    fn rejects_empty_option_like_and_oversized_revisions() {
        assert!(validate_revision(" ").is_err());
        assert!(validate_revision("--output").is_err());
        assert!(validate_revision(&"a".repeat(257)).is_err());
    }

    #[test]
    fn rejects_whitespace_and_control_characters_inside_revisions() {
        assert!(validate_revision("feature branch").is_err());
        assert!(validate_revision("feature\nbranch").is_err());
    }
}
