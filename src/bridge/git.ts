import { invoke } from "@tauri-apps/api/core";
import { demoSnapshot } from "./fake-bridge";
import type { GitBranchOverview, GitChangeSummary } from "./types";

export const nativeGitMethods = {
  readGitChangeSummary: async (
    projectPath: string,
    from: string,
    to?: string,
  ): Promise<GitChangeSummary> =>
    invoke<GitChangeSummary>("read_git_change_summary_command", {
      projectPath,
      from,
      to,
    }),

  readGitBranchOverview: async (
    projectPath: string,
    branch: string,
  ): Promise<GitBranchOverview> =>
    invoke<GitBranchOverview>("read_git_branch_overview_command", {
      projectPath,
      branch,
    }),
};

export const previewGitMethods = {
  readGitChangeSummary: async (
    projectPath: string,
    from: string,
    to?: string,
  ): Promise<GitChangeSummary> => {
    const project = demoSnapshot(
      projectPath.slice(0, projectPath.lastIndexOf("/")),
    ).projects.find((candidate) => candidate.path === projectPath);
    const commits = project?.repo?.recentCommits ?? [];
    return {
      projectPath,
      from,
      to: to ?? "HEAD",
      commits,
      files: commits.map((commit) => ({
        path: `src/${commit.shortSha}.ts`,
        status: "M",
        additions: 12,
        deletions: 4,
      })),
      insertions: commits.length * 12,
      deletions: commits.length * 4,
    };
  },

  readGitBranchOverview: async (
    projectPath: string,
    branch: string,
  ): Promise<GitBranchOverview> => {
    const project = demoSnapshot(
      projectPath.slice(0, projectPath.lastIndexOf("/")),
    ).projects.find((candidate) => candidate.path === projectPath);
    const commits = project?.repo?.recentCommits ?? [];
    const isCurrentBranch = branch === project?.repo?.branch;
    return {
      branch,
      commits,
      aheadOfHead: isCurrentBranch ? 0 : 2,
      behindHead: isCurrentBranch ? 0 : 3,
    };
  },
};
