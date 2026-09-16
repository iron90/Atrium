import type { ProjectSnapshot } from "../../bridge";
import { translate, type Language } from "../../i18n";
import { fill } from "../../shared/format";

export const statusLabel = (
  project: ProjectSnapshot,
  language: Language,
): string => {
  if (!project.repo) return translate(language, "gitNotFound");
  if (project.repo.isClean) return translate(language, "clean");
  return fill(
    translate(language, "uncommittedChanges"),
    "count",
    String(project.repo.worktreeChanges),
  );
};

export const statusClass = (project: ProjectSnapshot): string => {
  if (!project.repo) return "status-muted";
  return project.repo.isClean ? "status-good" : "status-warning";
};

export const syncStatusVisual = (
  repo: NonNullable<ProjectSnapshot["repo"]>,
): string => `↑ ${repo.ahead ?? "—"} · ↓ ${repo.behind ?? "—"}`;

export const syncStatusAriaLabel = (
  repo: NonNullable<ProjectSnapshot["repo"]>,
  language: Language,
): string => {
  if (repo.ahead === null || repo.behind === null) {
    return translate(language, "upstreamMissing");
  }
  return [
    fill(translate(language, "aheadCommits"), "count", String(repo.ahead)),
    fill(translate(language, "behindCommits"), "count", String(repo.behind)),
  ].join(" · ");
};

export const syncStatusClass = (
  repo: NonNullable<ProjectSnapshot["repo"]>,
): string => {
  if (repo.ahead === null || repo.behind === null) return "status-muted";
  return repo.ahead > 0 || repo.behind > 0 ? "status-warning" : "status-good";
};
