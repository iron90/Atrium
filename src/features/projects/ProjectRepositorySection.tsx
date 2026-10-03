import type { GitBranchOverview, ProjectSnapshot } from "../../bridge";
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
  selectedBranch,
  onSelectBranch,
  branchOverview,
  branchOverviewLoading,
  branchOverviewError,
  onOpenProjectAction,
}: {
  project: ProjectSnapshot;
  inspectedProject: ProjectSnapshot;
  isLoading: boolean;
  selectedBranch: string | null;
  onSelectBranch: (branch: string | null) => void;
  branchOverview: GitBranchOverview | null;
  branchOverviewLoading: boolean;
  branchOverviewError: string | null;
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
                {(() => {
                  const branches =
                    repo?.references.filter(
                      (reference) => reference.kind === "branch",
                    ) ?? [];
                  const current = repo?.branch ?? null;
                  // With no second branch there is nothing to inspect, so the
                  // row stays plain text instead of offering a hollow picker.
                  if (!repo || branches.length <= 1) {
                    return repo?.branch ?? t("unavailable");
                  }
                  // The picker only changes the inspection view; the worktree
                  // and HEAD stay on the checked-out branch. It is styled as
                  // plain row text — the chevron marks it as a control.
                  const value = selectedBranch ?? current ?? "";
                  return (
                    <>
                      <select
                        className="branch-picker"
                        value={value}
                        aria-label={t("branch")}
                        onChange={(event) =>
                          onSelectBranch(
                            event.target.value === current
                              ? null
                              : event.target.value,
                          )
                        }
                      >
                        {branches.map((reference) => (
                          <option key={reference.name} value={reference.name}>
                            {reference.name}
                            {reference.name === current
                              ? ` · ${t("currentBranch")}`
                              : ""}
                          </option>
                        ))}
                      </select>
                      <span className="branch-picker-chevron" aria-hidden="true">
                        ⌄
                      </span>
                    </>
                  );
                })()}
              </span>
            </div>
            {repo ? (
              <div className="repo-fact">
                <strong className="repo-fact-label">{t("syncStatus")}</strong>
                {selectedBranch && selectedBranch !== repo.branch ? (
                  <span
                    className="repo-fact-value git-sync"
                    title={t("branchComparedToHead")}
                  >
                    {branchOverviewLoading
                      ? "…"
                      : branchOverviewError
                        ? branchOverviewError
                        : `↑${branchOverview?.aheadOfHead ?? 0} ↓${
                            branchOverview?.behindHead ?? 0
                          }`}
                    <span className="sr-only">{t("branchComparedToHead")}</span>
                  </span>
                ) : (
                  <span
                    className={`repo-fact-value git-sync ${syncStatusClass(repo)}`}
                    title={syncStatusAriaLabel(repo, language)}
                  >
                    <span aria-hidden="true">{syncStatusVisual(repo)}</span>
                    <span className="sr-only">
                      {syncStatusAriaLabel(repo, language)}
                    </span>
                  </span>
                )}
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
