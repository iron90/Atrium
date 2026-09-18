import type { ProjectSnapshot } from "../../bridge";
import { useI18n } from "../../i18n";
import { DetailLoading, InspectorSection } from "./InspectorPrimitives";
import type { ProjectAction } from "./project-actions";
import {
  statusClass,
  statusLabel,
  syncStatusAriaLabel,
  syncStatusClass,
  syncStatusVisual,
} from "./presentation";

export function ProjectRepositorySection({
  project,
  inspectedProject,
  isLoading,
  onOpenProjectAction,
}: {
  project: ProjectSnapshot;
  inspectedProject: ProjectSnapshot;
  isLoading: boolean;
  onOpenProjectAction: (
    action: ProjectAction,
    project: ProjectSnapshot,
    linkId?: string,
  ) => void;
}) {
  const { language, t } = useI18n();
  const repo = inspectedProject.repo;
  const links = inspectedProject.links;

  return (
    <InspectorSection title={t("repository")}>
      <div className="repository-path-list">
        <div className="repository-path-row">
          <div className="repository-path-heading">
            <span className="repository-path-label">{t("localPath")}</span>
            <div className="repository-path-actions project-tool-bar">
              <button
                type="button"
                onClick={() =>
                  onOpenProjectAction("directory", inspectedProject)
                }
              >
                {t("openFolder")}
              </button>
              <button
                type="button"
                onClick={() =>
                  onOpenProjectAction("terminal", inspectedProject)
                }
              >
                {t("openTerminal")}
              </button>
              {!repo?.remote
                ? links.map((link) => (
                    <button
                      type="button"
                      key={link.id}
                      onClick={() =>
                        onOpenProjectAction("link", inspectedProject, link.id)
                      }
                    >
                      {link.label}
                    </button>
                  ))
                : null}
            </div>
          </div>
          <div className="repo-path">
            <span aria-hidden="true">⌁</span>
            <span title={project.path}>{project.path}</span>
          </div>
        </div>
        {repo?.remote ? (
          <div className="repository-path-row">
            <div className="repository-path-heading">
              <span className="repository-path-label">{t("remote")}</span>
              <div className="repository-path-actions project-tool-bar">
                <button
                  type="button"
                  onClick={() =>
                    onOpenProjectAction("remote", inspectedProject)
                  }
                >
                  {t("openRemote")}
                </button>
                {links.map((link) => (
                  <button
                    type="button"
                    key={link.id}
                    onClick={() =>
                      onOpenProjectAction("link", inspectedProject, link.id)
                    }
                  >
                    {link.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="repo-path remote-path">
              <span aria-hidden="true">↗</span>
              <span title={repo.remote}>{repo.remote}</span>
            </div>
          </div>
        ) : null}
      </div>
      {isLoading ? (
        <DetailLoading />
      ) : (
        <>
          <div className="repo-facts">
            <div className="repo-fact">
              <strong className="repo-fact-label">{t("branch")}</strong>
              <span className="repo-fact-value branch-line">
                <span aria-hidden="true">⑂</span>
                {repo?.branch ?? t("unavailable")}
              </span>
            </div>
            {repo ? (
              <div className="repo-fact">
                <strong className="repo-fact-label">{t("syncStatus")}</strong>
                <span
                  className={`repo-fact-value git-sync ${syncStatusClass(repo)}`}
                  title={syncStatusAriaLabel(repo, language)}
                >
                  <span aria-hidden="true">{syncStatusVisual(repo)}</span>
                  <span className="sr-only">
                    {syncStatusAriaLabel(repo, language)}
                  </span>
                </span>
              </div>
            ) : null}
            <div className="repo-fact">
              <strong className="repo-fact-label">{t("worktree")}</strong>
              <span
                className={`repo-fact-value ${statusClass(inspectedProject)}`}
              >
                <span className="state-dot" aria-hidden="true" />
                {statusLabel(inspectedProject, language)}
              </span>
            </div>
          </div>
        </>
      )}
    </InspectorSection>
  );
}
