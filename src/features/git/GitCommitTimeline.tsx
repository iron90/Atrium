import { useMemo } from "react";
import type { ProjectSnapshot } from "../../bridge";
import { useI18n } from "../../i18n";
import { formatTime } from "../../shared/format";
import { collectTimelineCommits } from "./git-history-model";

export function GitCommitTimeline({
  projects,
  selectedId,
  onSelect,
}: {
  projects: ProjectSnapshot[];
  selectedId?: string;
  onSelect: (projectId: string) => void;
}) {
  const { language, t } = useI18n();
  const commits = useMemo(() => collectTimelineCommits(projects), [projects]);

  return commits.length ? (
    <div className="git-history-list">
      {commits.map(({ project, commit }) => (
        <button
          type="button"
          className={`git-history-row ${project.id === selectedId ? "is-selected" : ""}`}
          key={`${project.id}:${commit.sha}`}
          onClick={() => onSelect(project.id)}
        >
          <span className="commit-dot" />
          <span className="git-history-project">
            <strong>{project.name}</strong>
            <span>{commit.subject}</span>
          </span>
          <span className="git-history-meta">
            <span>{commit.shortSha}</span>
            <time>{formatTime(commit.timestamp, language)}</time>
          </span>
        </button>
      ))}
    </div>
  ) : (
    <div className="empty-state">
      <span>⌘</span>
      <h3>{t("noCommits")}</h3>
      <p>{t("gitHistoryDescription")}</p>
    </div>
  );
}
