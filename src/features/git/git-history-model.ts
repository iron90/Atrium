import type { GitCommit, ProjectSnapshot } from "../../bridge";

export interface TimelineCommit {
  project: ProjectSnapshot;
  commit: GitCommit;
}

export const collectTimelineCommits = (
  projects: ProjectSnapshot[],
): TimelineCommit[] =>
  projects
    .flatMap((project) =>
      (project.repo?.recentCommits ?? []).map((commit) => ({
        project,
        commit,
      })),
    )
    .sort(
      (left, right) =>
        right.commit.timestamp - left.commit.timestamp ||
        left.project.name.localeCompare(right.project.name) ||
        left.project.id.localeCompare(right.project.id) ||
        left.commit.sha.localeCompare(right.commit.sha),
    );
