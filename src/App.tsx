import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActivityMessage } from "./app/activity-message";
import { AppSidebar } from "./app/AppSidebar";
import { LocalActivityPanel } from "./app/LocalActivityPanel";
import { type PageId } from "./app/navigation";
import { bridge, isTauriRuntime } from "./bridge";
import { demoSnapshot } from "./bridge/fake-bridge";
import { GitHistoryView } from "./features/git/GitHistoryView";
import { ProjectInspector } from "./features/projects/ProjectInspector";
import { PlatformMatrix } from "./features/projects/PlatformMatrix";
import { ProjectList } from "./features/projects/ProjectList";
import {
  openProjectAction,
  type ProjectAction,
} from "./features/projects/project-actions";
import { useProjectInspectorActions } from "./features/projects/use-project-inspector-actions";
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
import { fill, formatTime } from "./shared/format";
import type { ProjectSnapshot, WorkspaceSnapshot } from "./bridge";
import "./app.css";

const DEFAULT_ROOT = "~/projects";

export default function App() {
  const nativeRuntime = isTauriRuntime();
  const [preferences] = useState<LocalPreferences>(readLocalPreferences);
  const initialRootPath =
    preferences.rootPath?.trim() || (nativeRuntime ? "" : DEFAULT_ROOT);
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
    nativeRuntime
      ? emptySnapshot(initialRootPath)
      : demoSnapshot(initialRootPath),
  );
  const [error, setError] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState<ActivityMessage>({
    type: "ready",
  });
  const inspectorResetRef = useRef<() => void>(() => undefined);

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
    inspectorResetRef.current();
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
    nativeRuntime,
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
    reset: resetProjectInspectionState,
    guidanceMessage,
    agentPrompt,
    isAgentPromptCopied,
    isWritingGuidance,
    cleanupFeedback,
    cleanupSelection,
    setCleanupSelection,
    isCleaningArtifacts,
    generateGuidance: handleGenerateGuidance,
    cleanArtifacts: handleCleanArtifacts,
    copyAgentPrompt: handleCopyAgentPrompt,
  } = useProjectInspectorActions({
    language,
    inspectorProject,
    onError: handleWorkspaceError,
    updateInspectorProject,
  });
  useEffect(() => {
    inspectorResetRef.current = resetProjectInspectionState;
  }, [resetProjectInspectionState]);

  const {
    activeRun,
    outputLines,
    runProjectCommand: handleRun,
    stopActiveRun: handleStop,
  } = useProjectRunner({
    nativeRuntime,
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

  const handleOpenProjectAction = async (
    action: ProjectAction,
    project: ProjectSnapshot,
    linkId?: string,
  ) => {
    try {
      await openProjectAction(action, project, linkId);
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
        <AppSidebar
          activePage={activePage}
          nativeRuntime={nativeRuntime}
          onPageChange={setActivePage}
        />

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

                <LocalActivityPanel
                  activeRun={activeRun}
                  message={runMessage}
                  onStop={handleStop}
                  snapshot={snapshot}
                />
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
