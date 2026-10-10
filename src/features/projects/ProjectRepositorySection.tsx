import { useEffect, useRef, useState } from "react";
import type { GitBranchOverview, ProjectSnapshot } from "../../bridge";
import { useI18n } from "../../i18n";
import { normalizeWindowsPath } from "../../shared/windows-path";
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
  ) => void;
}) {
  const { language, t } = useI18n();
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [branchMenuProjectId, setBranchMenuProjectId] = useState(project.id);
  const branchRowRef = useRef<HTMLDivElement | null>(null);
  const repo = inspectedProject.repo;
  const localPath = normalizeWindowsPath(project.path);

  // A keyboard-driven project switch bypasses the outside-click handler, so
  // the menu reset is tied to the project identity during render.
  if (branchMenuProjectId !== project.id) {
    setBranchMenuProjectId(project.id);
    setBranchMenuOpen(false);
  }

  // Clicking outside the row, or Escape, closes the branch menu.
  useEffect(() => {
    if (!branchMenuOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!branchRowRef.current?.contains(event.target as Node)) {
        setBranchMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBranchMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [branchMenuOpen]);

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
            </div>
          </div>
          <div className="repo-path">
            <span aria-hidden="true">⌁</span>
            <span title={localPath}>{localPath}</span>
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
            <div className="repo-fact branch-fact" ref={branchRowRef}>
              <strong className="repo-fact-label">{t("branch")}</strong>
              <span className="repo-fact-value branch-line">
                <span aria-hidden="true" className="branch-line-glyph">
                  ⑂
                </span>
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
                  // and HEAD stay on the checked-out branch. The menu is
                  // custom-built: the native select popup cannot be styled.
                  const viewing = selectedBranch ?? current ?? "";
                  return (
                    <button
                      type="button"
                      className="branch-picker-trigger"
                      aria-haspopup="listbox"
                      aria-expanded={branchMenuOpen}
                      aria-label={t("branch")}
                      onClick={() => setBranchMenuOpen((open) => !open)}
                    >
                      <span className="branch-picker-name">{viewing}</span>
                      <span
                        className="branch-picker-caret"
                        aria-hidden="true"
                      />
                    </button>
                  );
                })()}
              </span>
              {branchMenuOpen && repo
                ? (() => {
                    const branches = repo.references.filter(
                      (reference) => reference.kind === "branch",
                    );
                    const current = repo.branch;
                    return (
                      <div
                        className="branch-menu"
                        role="listbox"
                        aria-label={t("branch")}
                      >
                        {branches.map((reference) => {
                          const isCurrent = reference.name === current;
                          const isSelected =
                            (selectedBranch ?? current) === reference.name;
                          return (
                            <button
                              type="button"
                              key={reference.name}
                              role="option"
                              aria-selected={isSelected}
                              className={`branch-menu-item${
                                isSelected ? " is-selected" : ""
                              }`}
                              onClick={() => {
                                onSelectBranch(
                                  isCurrent ? null : reference.name,
                                );
                                setBranchMenuOpen(false);
                              }}
                            >
                              <span
                                className={`branch-menu-dot${
                                  isCurrent ? " is-current" : ""
                                }`}
                                aria-hidden="true"
                              />
                              {reference.name}
                              {isCurrent ? (
                                <span className="sr-only">
                                  {t("currentBranch")}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()
                : null}
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
