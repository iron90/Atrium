use std::path::Path;

use crate::command_boundary::run_blocking;
use crate::git::read_git_change_summary;
use crate::model::GitChangeSummary;
use crate::project_path::canonical_project_root;

#[tauri::command]
pub async fn read_git_change_summary_command(
    project_path: String,
    from: String,
    to: Option<String>,
) -> Result<GitChangeSummary, String> {
    run_blocking("Git change summary", move || {
        read_git_change_summary_for_project(Path::new(&project_path), &from, to.as_deref())
    })
    .await
}

fn read_git_change_summary_for_project(
    project_path: &Path,
    from: &str,
    to: Option<&str>,
) -> Result<GitChangeSummary, String> {
    let root = canonical_project_root(project_path)?;
    read_git_change_summary(&root, from, to)
}

#[cfg(test)]
mod tests {
    use super::read_git_change_summary_for_project;
    use std::fs;

    fn fixture_path(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("atrium-git-command-{name}-{}", std::process::id()))
    }

    #[test]
    fn rejects_a_non_directory_before_running_git() {
        let path = fixture_path("file");
        let _ = fs::remove_file(&path);
        fs::write(&path, b"not a project directory").expect("create fixture file");

        assert_eq!(
            read_git_change_summary_for_project(&path, "HEAD~1", None)
                .expect_err("file path must be rejected"),
            "Project path is not a directory"
        );

        fs::remove_file(path).expect("remove fixture file");
    }
}
