import { invoke } from "@tauri-apps/api/core";
import { demoSnapshot } from "./fake-bridge";
import { isTauriRuntime } from "./runtime";
import type { GitChangeSummary } from "./types";

export const readGitChangeSummary = async (
  projectPath: string,
  from: string,
  to?: string,
): Promise<GitChangeSummary> => {
  if (!isTauriRuntime()) {
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
  }
  return invoke<GitChangeSummary>("read_git_change_summary_command", {
    projectPath,
    from,
    to,
  });
};
