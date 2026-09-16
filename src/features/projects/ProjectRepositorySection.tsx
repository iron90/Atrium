import type { ProjectSnapshot } from "../../bridge";
import { useI18n } from "../../i18n";
import { DetailLoading, InspectorSection } from "./InspectorPrimitives";
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
}: {
  project: ProjectSnapshot;
  inspectedProject: ProjectSnapshot;
  isLoading: boolean;
}) {
  const { language, t } = useI18n();
  const repo = inspectedProject.repo;

  return (
    <InspectorSection title={t("repository")}>
      <div className="repo-path">
        <span aria-hidden="true">⌁</span>
        <span title={project.path}>{project.path}</span>
      </div>
      {isLoading ? (
        <DetailLoading />
      ) : (
        <>
          <div className="repo-facts">
            <span>
              <strong>{t("branch")}</strong>
              {repo?.branch ?? t("unavailable")}
            </span>
            <span>
              <strong>{t("worktree")}</strong>
              <em className={statusClass(inspectedProject)}>
                {statusLabel(inspectedProject, language)}
              </em>
            </span>
            {repo ? (
              <span>
                <strong>{t("syncStatus")}</strong>
                <em
                  className={`git-sync ${syncStatusClass(repo)}`}
                  title={syncStatusAriaLabel(repo, language)}
                >
                  <span aria-hidden="true">{syncStatusVisual(repo)}</span>
                  <span className="sr-only">
                    {syncStatusAriaLabel(repo, language)}
                  </span>
                </em>
              </span>
            ) : null}
          </div>
          {repo?.remote ? (
            <div className="remote-line">
              <span>{t("remote")}</span>
              <span>{repo.remote}</span>
            </div>
          ) : null}
        </>
      )}
    </InspectorSection>
  );
}
