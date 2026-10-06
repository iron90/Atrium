import { memo } from "react";
import type { ProjectSnapshot, WorkspaceSnapshot } from "../bridge";
import { useI18n } from "../i18n";
import { fill, formatTime } from "../shared/format";
import {
  ProjectInspector,
  type ProjectInspectorProps,
} from "../features/projects/ProjectInspector";
import {
  ProjectList,
  type ProjectListProps,
} from "../features/projects/ProjectList";

export interface ProjectsPageProps {
  snapshot: WorkspaceSnapshot;
  visibleProjects: ProjectSnapshot[];
  projectList: ProjectListProps;
  inspector: ProjectInspectorProps;
}

export const ProjectsPage = memo(function ProjectsPage({
  snapshot,
  visibleProjects,
  projectList,
  inspector,
}: ProjectsPageProps) {
  const { language, t } = useI18n();

  return (
    <section className="content-grid">
      <div className="board-pane">
        <div className="board-summary">
          <div>
            <span className="eyebrow">{t("projectIndex")}</span>
            <h2>
              {fill(
                t("projectsDiscovered"),
                "count",
                String(visibleProjects.length),
              )}
            </h2>
          </div>
          <div className="summary-meta">
            <span>
              {fill(
                t("cleanRepositories"),
                "count",
                String(
                  snapshot.projects.filter(
                    (project) =>
                      project.repo?.worktreeStatusAvailable &&
                      project.repo.isClean,
                  ).length,
                ),
              )}
            </span>
            <span>
              {fill(
                t("lastScan"),
                "time",
                formatTime(snapshot.scannedAt, language),
              )}
            </span>
          </div>
        </div>

        {snapshot.warnings.length > 0 ? (
          <div className="scan-warnings" role="status">
            <strong>{t("scanWarnings")}</strong>
            <ul>
              {snapshot.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <ProjectList {...projectList} />
      </div>

      <ProjectInspector {...inspector} />
    </section>
  );
});
