import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatActivityMessage,
  type ActivityMessage,
} from "./app/activity-message";
import { bridge, isTauriRuntime } from "./bridge";
import { demoSnapshot } from "./bridge/fake-bridge";
import { GitHistoryView } from "./features/git/GitHistoryView";
import { createConfigurationAgentPrompt } from "./features/projects/guidance-prompt";
import { ProjectInspector } from "./features/projects/ProjectInspector";
import { PlatformMatrix } from "./features/projects/PlatformMatrix";
import { ProjectList } from "./features/projects/ProjectList";
import { emptySnapshot, metaForProject } from "./features/projects/model";
import { useProjectMetaState } from "./features/projects/use-project-meta-state";
import { useProjectListViewState } from "./features/projects/use-project-list-view-state";
import {
  useProjectWorkspace,
  type WorkspaceMessage,
} from "./features/projects/use-project-workspace";
import {
  useProjectRunner,
  type RunMessage as ProjectRunMessage,
} from "./features/runs/use-project-runner";
import { SettingsPanel } from "./features/settings/SettingsPanel";
import { type LayoutId, type ThemeId } from "./features/settings/model";
import { I18nProvider, translate } from "./i18n";
import type { Language, TranslationKey } from "./i18n";
import {
  persistLocalPreferences,
  readLocalPreferences,
  type LocalPreferences,
} from "./app/preferences";
import { fill, formatRelative, formatTime } from "./shared/format";
import type { ProjectSnapshot, WorkspaceSnapshot } from "./bridge";
import "./app.css";

type PageId = "projects" | "git" | "settings";

const DEFAULT_ROOT = "~/projects";

const navItems: Array<{
  id: PageId;
  labelKey: TranslationKey;
  glyph: string;
}> = [
  { id: "projects", labelKey: "projects", glyph: "▦" },
  { id: "git", labelKey: "gitHistory", glyph: "⌘" },
  { id: "settings", labelKey: "settings", glyph: "⚙" },
];

export default function App() {
  const [preferences] = useState<LocalPreferences>(readLocalPreferences);
  const initialRootPath =
    preferences.rootPath?.trim() || (isTauriRuntime() ? "" : DEFAULT_ROOT);
  const initialWorkspacePaths = preferences.workspaces?.length
    ? preferences.workspaces
    : initialRootPath
      ? [initialRootPath]
      : [];
  const [theme, setTheme] = useState<ThemeId>(
    preferences.theme ?? "deep-ocean",
  );
  const [layout, setLayout] = useState<LayoutId>(
    preferences.layout ?? "overview",
  );
  const [language, setLanguage] = useState<Language>(
    preferences.language ?? "en",
  );
  const [activePage, setActivePage] = useState<PageId>("projects");
  const [excludeNames, setExcludeNames] = useState<string[]>(
    preferences.excludeNames ?? [],
  );
  const {
    projectMeta,
    ensureProjectMeta,
    updateProjectMeta,
    reorderProjects,
    moveProjectByKeyboard,
  } = useProjectMetaState(preferences.projectMeta ?? {});
  const [initialSnapshot] = useState<WorkspaceSnapshot>(() =>
    isTauriRuntime()
      ? emptySnapshot(initialRootPath)
      : demoSnapshot(initialRootPath),
  );
  const [error, setError] = useState<string | null>(null);
  const [guidanceMessage, setGuidanceMessage] = useState<string | null>(null);
  const [agentPrompt, setAgentPrompt] = useState<string | null>(null);
  const [isAgentPromptCopied, setIsAgentPromptCopied] = useState(false);
  const [isWritingGuidance, setIsWritingGuidance] = useState(false);
  const [cleanupFeedback, setCleanupFeedback] = useState<{
    removedBytes: number;
    failedCount: number;
  } | null>(null);
  const [cleanupSelection, setCleanupSelection] = useState<string[]>([]);
  const [isCleaningArtifacts, setIsCleaningArtifacts] = useState(false);
  const [runMessage, setRunMessage] = useState<ActivityMessage>({
    type: "ready",
  });

  const handleWorkspaceError = useCallback(
    (message: string | null) => setError(message),
    [],
  );
  const handleWorkspaceMessage = useCallback(
    (message: WorkspaceMessage) => setRunMessage(message),
    [],
  );
  const handleRunMessage = useCallback(
    (message: ProjectRunMessage) => setRunMessage(message),
    [],
  );
  const resetProjectInspection = useCallback(() => {
    setGuidanceMessage(null);
    setAgentPrompt(null);
    setIsAgentPromptCopied(false);
    setCleanupFeedback(null);
    setCleanupSelection([]);
    setIsCleaningArtifacts(false);
  }, []);
  const {
    rootPath,
    workspacePaths,
    snapshot,
    selectedProject,
    inspectorProject,
    isLoadingDetails,
    isScanning,
    refreshingProjectId,
    updateInspectorProject,
    updateWorkspacePaths,
    selectProject,
    scanWorkspace,
    refreshProject,
  } = useProjectWorkspace({
    nativeRuntime: isTauriRuntime(),
    preferences,
    initialRootPath,
    initialWorkspacePaths,
    initialSnapshot,
    excludeNames,
    language,
    onError: handleWorkspaceError,
    onMessage: handleWorkspaceMessage,
    onProjectSelected: resetProjectInspection,
    onSnapshotApplied: ensureProjectMeta,
  });

  const {
    activeRun,
    outputLines,
    runProjectCommand: handleRun,
    stopActiveRun: handleStop,
  } = useProjectRunner({
    nativeRuntime: isTauriRuntime(),
    selectedProject,
    language,
    onError: handleWorkspaceError,
    onMessage: handleRunMessage,
  });

  useEffect(() => {
    persistLocalPreferences({
      theme,
      layout,
      language,
      rootPath,
      workspaces: workspacePaths,
      excludeNames,
      projectMeta,
    });
  }, [
    excludeNames,
    language,
    layout,
    projectMeta,
    rootPath,
    theme,
    workspacePaths,
  ]);

  const t = (key: TranslationKey): string => translate(language, key);
  const i18nValue = useMemo(
    () => ({
      language,
      setLanguage,
      t: (key: TranslationKey) => translate(language, key),
    }),
    [language],
  );

  const {
    search: projectSearch,
    setSearch: setProjectSearch,
    platformFilter,
    setPlatformFilter,
    channelFilter,
    setChannelFilter,
    projectSort,
    setProjectSort,
    showHiddenProjects,
    setShowHiddenProjects,
    filterOptions,
    visibleProjects,
  } = useProjectListViewState(snapshot.projects, projectMeta);

  const handleGenerateGuidance = async (project: ProjectSnapshot) => {
    setIsWritingGuidance(true);
    setGuidanceMessage(null);
    setError(null);
    try {
      const report = await bridge.generateProjectGuidance(project.path);
      setGuidanceMessage(
        fill(t("guidanceGenerated"), "path", report.paths.join(" · ")),
      );
      setAgentPrompt(
        createConfigurationAgentPrompt(project, report.paths, language),
      );
      setIsAgentPromptCopied(false);
    } catch (reportError) {
      setError(
        reportError instanceof Error
          ? reportError.message
          : String(reportError),
      );
    } finally {
      setIsWritingGuidance(false);
    }
  };

  const handleCleanArtifacts = async (project: ProjectSnapshot) => {
    const storage =
      inspectorProject?.id === project.id
        ? inspectorProject.storage
        : undefined;
    const selectedPaths = cleanupSelection.length
      ? cleanupSelection
      : (storage?.entries.map((entry) => entry.relativePath) ?? []);
    if (
      !storage?.entries.length ||
      !selectedPaths.length ||
      isCleaningArtifacts
    )
      return;
    if (!window.confirm(t("confirmCleanArtifacts"))) return;

    setIsCleaningArtifacts(true);
    setCleanupFeedback(null);
    setError(null);
    try {
      const result = await bridge.cleanProjectArtifacts(
        project.path,
        selectedPaths,
      );
      updateInspectorProject((current) =>
        current?.id === project.id
          ? { ...current, storage: result.storage }
          : current,
      );
      setCleanupFeedback({
        removedBytes: result.removedBytes,
        failedCount: result.failedEntries.length,
      });
      setCleanupSelection([]);
    } catch (cleanupError) {
      setError(
        cleanupError instanceof Error
          ? cleanupError.message
          : String(cleanupError),
      );
    } finally {
      setIsCleaningArtifacts(false);
    }
  };

  const handleCopyAgentPrompt = async () => {
    if (!agentPrompt) return;
    try {
      if (!navigator.clipboard) {
        throw new Error("Clipboard is unavailable in this session.");
      }
      await navigator.clipboard.writeText(agentPrompt);
      setIsAgentPromptCopied(true);
    } catch (copyError) {
      setError(
        copyError instanceof Error ? copyError.message : String(copyError),
      );
    }
  };

  const handleOpenProjectAction = async (
    action: "directory" | "terminal" | "remote" | "link",
    project: ProjectSnapshot,
    linkId?: string,
  ) => {
    try {
      if (action === "directory")
        await bridge.openProjectDirectory(project.path);
      if (action === "terminal") {
        await bridge.openProjectTerminal(project.path, project.tools?.terminal);
      }
      if (action === "remote" && project.repo?.remote) {
        await bridge.openProjectRemote(project.repo.remote);
      }
      if (action === "link" && linkId) {
        await bridge.openProjectLink(project.path, linkId);
      }
    } catch (openError) {
      setError(
        openError instanceof Error ? openError.message : String(openError),
      );
    }
  };

  const handleLayoutChange = (nextLayout: LayoutId) => {
    setLayout(nextLayout);
    if (activePage !== "settings") {
      setActivePage("projects");
    }
  };

  const heading =
    activePage === "settings"
      ? {
          title: t("settingsTitle"),
          body: t("settingsSubtitle"),
        }
      : activePage === "git"
        ? {
            title: t("gitHistoryTitle"),
            body: t("gitHistoryDescription"),
          }
        : {
            title: t("projectsInView"),
            body: t("factsSubtitle"),
          };

  return (
    <I18nProvider value={i18nValue}>
      <div className="app-shell" data-theme={theme} data-layout={layout}>
        <aside className="sidebar">
          <div className="brand-block">
            <div className="brand-mark">A</div>
            <div>
              <div className="brand-name">Atrium</div>
              <div className="brand-subtitle">{t("localProjectBoard")}</div>
            </div>
          </div>

          <nav className="primary-nav" aria-label={t("localProjectBoard")}>
            {navItems.map((item) => (
              <button
                className={`nav-item ${activePage === item.id ? "is-active" : ""}`}
                key={item.id}
                type="button"
                onClick={() => setActivePage(item.id)}
              >
                <span className="nav-glyph" aria-hidden="true">
                  {item.glyph}
                </span>
                <span>{t(item.labelKey)}</span>
              </button>
            ))}
          </nav>

          <div className="sidebar-note">
            <span className="note-kicker">{t("localFirst")}</span>
            <p>{t("localFirstBody")}</p>
          </div>

          <div className="sidebar-footer">
            <span className="connection-dot" />
            <span>
              {isTauriRuntime() ? t("nativeSession") : t("previewSession")}
            </span>
          </div>
        </aside>

        <main className="main-column">
          <header className="topbar">
            <div className="page-heading">
              <h1>{heading.title}</h1>
              <p>{heading.body}</p>
            </div>
          </header>

          {error ? (
            <div className="error-banner" role="alert">
              {error}
            </div>
          ) : null}

          {activePage === "settings" ? (
            <SettingsPanel
              theme={theme}
              setTheme={setTheme}
              layout={layout}
              setLayout={handleLayoutChange}
              language={language}
              setLanguage={setLanguage}
              workspacePaths={workspacePaths}
              onWorkspacePathsChange={updateWorkspacePaths}
              excludeNames={excludeNames}
              setExcludeNames={setExcludeNames}
              onScan={() => void scanWorkspace()}
              isScanning={isScanning}
            />
          ) : activePage === "git" ? (
            <GitHistoryView
              key={selectedProject?.id ?? "none"}
              projects={snapshot.projects}
              selectedId={selectedProject?.id}
              onSelect={selectProject}
            />
          ) : (
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
                            (project) => project.repo?.isClean,
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
                    onSelect={selectProject}
                  />
                ) : (
                  <ProjectList
                    projects={visibleProjects}
                    selectedId={selectedProject?.id}
                    onSelect={selectProject}
                    search={projectSearch}
                    setSearch={setProjectSearch}
                    platformFilter={platformFilter}
                    setPlatformFilter={setPlatformFilter}
                    channelFilter={channelFilter}
                    setChannelFilter={setChannelFilter}
                    projectSort={projectSort}
                    setProjectSort={setProjectSort}
                    showHidden={showHiddenProjects}
                    setShowHidden={setShowHiddenProjects}
                    filterOptions={filterOptions}
                    projectMeta={projectMeta}
                    onToggleFavorite={(id) =>
                      updateProjectMeta(
                        id,
                        {
                          favorite: !metaForProject(projectMeta, id, 0)
                            .favorite,
                        },
                        snapshot.projects.length,
                      )
                    }
                    onToggleHidden={(id) =>
                      updateProjectMeta(
                        id,
                        {
                          hidden: !metaForProject(projectMeta, id, 0).hidden,
                        },
                        snapshot.projects.length,
                      )
                    }
                    onReorder={(orderedVisibleIds) =>
                      reorderProjects(snapshot.projects, orderedVisibleIds)
                    }
                    onKeyboardMove={(projectId, direction) =>
                      moveProjectByKeyboard(
                        snapshot.projects,
                        visibleProjects,
                        projectId,
                        direction,
                      )
                    }
                  />
                )}

                <div className="local-activity">
                  <div className="activity-heading">
                    <span className="eyebrow">{t("localActivity")}</span>
                    <span>{formatActivityMessage(runMessage, language)}</span>
                  </div>
                  <div className="activity-cards">
                    <div className="activity-card">
                      <span
                        className={`activity-pulse ${activeRun ? "is-running" : ""}`}
                      />
                      <div>
                        <strong>
                          {activeRun ? t("runningCommand") : t("ready")}
                        </strong>
                        <span>
                          {activeRun?.displayCommand ?? t("noCommandRunning")}
                        </span>
                      </div>
                      {activeRun ? (
                        <button type="button" onClick={() => void handleStop()}>
                          {t("stop")}
                        </button>
                      ) : null}
                    </div>
                    <div className="activity-card">
                      <span className="activity-icon" aria-hidden="true">
                        ◷
                      </span>
                      <div>
                        <strong>{t("recentScan")}</strong>
                        <span>
                          {fill(
                            t("projectsDiscovered"),
                            "count",
                            String(snapshot.projects.length),
                          )}{" "}
                          · {formatRelative(snapshot.scannedAt, language)}
                        </span>
                      </div>
                      <span className="activity-result">
                        {snapshot.warnings.length
                          ? fill(
                              t("notes"),
                              "count",
                              String(snapshot.warnings.length),
                            )
                          : t("noWarnings")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <ProjectInspector
                project={selectedProject}
                details={
                  inspectorProject?.id === selectedProject?.id
                    ? inspectorProject
                    : undefined
                }
                isLoading={isLoadingDetails}
                activeRun={activeRun}
                outputLines={outputLines}
                onRun={(command, profileId, profileAction) =>
                  void handleRun(command, undefined, profileId, profileAction)
                }
                onRefreshProject={(project) => void refreshProject(project)}
                isRefreshing={refreshingProjectId === selectedProject?.id}
                onStop={() => void handleStop()}
                onGenerateGuidance={(project) =>
                  void handleGenerateGuidance(project)
                }
                guidanceMessage={guidanceMessage}
                agentPrompt={agentPrompt}
                isAgentPromptCopied={isAgentPromptCopied}
                onCopyAgentPrompt={() => void handleCopyAgentPrompt()}
                isWritingGuidance={isWritingGuidance}
                cleanupFeedback={cleanupFeedback}
                cleanupSelection={cleanupSelection}
                onCleanupSelectionChange={setCleanupSelection}
                isCleaningArtifacts={isCleaningArtifacts}
                onCleanArtifacts={(project) =>
                  void handleCleanArtifacts(project)
                }
                onOpenArtifact={(projectPath, profileId, relativePath) =>
                  void bridge
                    .openArtifact(projectPath, profileId, relativePath)
                    .catch((openError) => {
                      setError(
                        openError instanceof Error
                          ? openError.message
                          : String(openError),
                      );
                    })
                }
                onOpenProjectAction={(action, project, linkId) =>
                  void handleOpenProjectAction(action, project, linkId)
                }
              />
            </section>
          )}
        </main>
      </div>
    </I18nProvider>
  );
}
