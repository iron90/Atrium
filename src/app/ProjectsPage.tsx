import type { ProjectSnapshot, WorkspaceSnapshot } from "../bridge";
import { useI18n } from "../i18n";
import { fill, formatTime } from "../shared/format";
import type { LayoutId } from "../features/settings/model";
import { PlatformMatrix } from "../features/projects/PlatformMatrix";
import {
  ProjectInspector,
  type ProjectInspectorProps,
} from "../features/projects/ProjectInspector";
import {
  ProjectList,
  type ProjectListProps,
} from "../features/projects/ProjectList";

export interface ProjectsPageProps {
  layout: LayoutId;
  snapshot: WorkspaceSnapshot;
  visibleProjects: ProjectSnapshot[];
  projectList: ProjectListProps;
  inspector: ProjectInspectorProps;
}

export function ProjectsPage({
  layout,
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

        {layout === "matrix" ? (
          <PlatformMatrix
            projects={visibleProjects}
            onSelect={projectList.onSelect}
          />
        ) : (
          <ProjectList {...projectList} />
        )}
      </div>

      <ProjectInspector {...inspector} />
    </section>
  );
}
