use crate::model::{Facet, GitSnapshot, RunFinished, RunStarted, RunStatus};
use crate::run_validation::ValidatedRun;
use crate::time::now_millis;

pub(crate) struct RunContext {
    run_id: String,
    project_id: String,
    command_id: String,
    profile_id: Option<String>,
    profile_action: Option<crate::model::CommandKind>,
    project_path: String,
    platform: Option<Facet>,
    channel: Option<Facet>,
    git_branch: Option<String>,
    git_commit: Option<String>,
    worktree_clean: Option<bool>,
    display_command: String,
    started_at: i64,
}

impl RunContext {
    pub(crate) fn new(request: &ValidatedRun) -> Self {
        Self {
            run_id: uuid::Uuid::new_v4().to_string(),
            project_id: request.project.id.clone(),
            command_id: request.command.id.clone(),
            profile_id: request.profile_id.clone(),
            profile_action: request.profile_action.clone(),
            project_path: request.project.path.clone(),
            platform: request.platform.clone(),
            channel: request.channel.clone(),
            git_branch: request
                .project
                .repo
                .as_ref()
                .and_then(|repo| repo.branch.clone()),
            git_commit: request
                .project
                .repo
                .as_ref()
                .and_then(|repo| repo.last_commit.as_ref())
                .map(|commit| commit.sha.clone()),
            worktree_clean: reported_worktree_clean(request.project.repo.as_ref()),
            display_command: request.command.display_command.clone(),
            started_at: now_millis(),
        }
    }

    pub(crate) fn run_id(&self) -> &str {
        &self.run_id
    }

    pub(crate) fn started(&self) -> RunStarted {
        RunStarted {
            run_id: self.run_id.clone(),
            project_id: self.project_id.clone(),
            command_id: self.command_id.clone(),
            profile_id: self.profile_id.clone(),
            display_command: self.display_command.clone(),
            started_at: self.started_at,
            status: RunStatus::Running,
        }
    }

    pub(crate) fn finished(
        &self,
        status: RunStatus,
        exit_code: Option<i32>,
        stdout: String,
        stderr: String,
    ) -> RunFinished {
        let finished_at = now_millis();
        RunFinished {
            run_id: self.run_id.clone(),
            project_id: self.project_id.clone(),
            command_id: self.command_id.clone(),
            profile_id: self.profile_id.clone(),
            profile_action: self.profile_action.clone(),
            project_path: self.project_path.clone(),
            platform: self.platform.clone(),
            channel: self.channel.clone(),
            git_branch: self.git_branch.clone(),
            git_commit: self.git_commit.clone(),
            worktree_clean: self.worktree_clean,
            display_command: self.display_command.clone(),
            started_at: self.started_at,
            finished_at,
            duration_ms: finished_at.saturating_sub(self.started_at),
            status,
            exit_code,
            stdout,
            stderr,
        }
    }
}

fn reported_worktree_clean(repo: Option<&GitSnapshot>) -> Option<bool> {
    repo.filter(|repo| repo.worktree_status_available)
        .map(|repo| repo.is_clean)
}

#[cfg(test)]
mod tests {
    use super::reported_worktree_clean;
    use crate::model::GitSnapshot;

    fn snapshot(worktree_status_available: bool, is_clean: bool) -> GitSnapshot {
        GitSnapshot {
            branch: Some("main".to_string()),
            is_clean,
            worktree_changes: 0,
            worktree_status_available,
            remote: None,
            ahead: None,
            behind: None,
            last_commit: None,
            recent_commits: Vec::new(),
            references: Vec::new(),
        }
    }

    #[test]
    fn omits_worktree_state_when_git_status_is_unavailable() {
        assert_eq!(reported_worktree_clean(None), None);
        assert_eq!(reported_worktree_clean(Some(&snapshot(false, false))), None);
        assert_eq!(
            reported_worktree_clean(Some(&snapshot(true, true))),
            Some(true)
        );
    }
}
