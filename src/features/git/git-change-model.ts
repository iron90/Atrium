import type { ProjectSnapshot } from "../../bridge";

export function revisionOptions(project?: ProjectSnapshot): string[] {
  return Array.from(
    new Set([
      "HEAD",
      "HEAD~1",
      ...(project?.repo?.references ?? []).map((reference) => reference.name),
      ...(project?.repo?.recentCommits ?? []).map((commit) => commit.sha),
    ]),
  );
}

export function defaultFromRevision(project?: ProjectSnapshot): string {
  return project?.repo?.recentCommits[1]?.sha ?? "HEAD~1";
}
