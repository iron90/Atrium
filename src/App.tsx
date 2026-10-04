import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppSidebar } from "./app/AppSidebar";
import { PageTransition } from "./app/PageTransition";
import { type PageId } from "./app/navigation";
import { ProjectsPage } from "./app/ProjectsPage";
import { bridge, isTauriRuntime } from "./bridge";
import { DEMO_WORKSPACE_ROOT, demoSnapshot } from "./bridge/fake-bridge";
import { GitHistoryView } from "./features/git/GitHistoryView";
import type { ProjectInspectorProps } from "./features/projects/ProjectInspector";
import type { ProjectListProps } from "./features/projects/ProjectList";
import type { InspectorSectionId } from "./features/projects/inspector-section-visibility";
import {
  openProjectAction,
  type ProjectAction,
} from "./features/projects/project-actions";
import { useProjectInspectorActions } from "./features/projects/use-project-inspector-actions";
import { emptySnapshot } from "./features/projects/workspace-snapshot";
import { useProjectMetaState } from "./features/projects/use-project-meta-state";
import { useProjectListViewState } from "./features/projects/use-project-list-view-state";
import { useProjectWorkspace } from "./features/projects/use-project-workspace";
import { useProjectRunner } from "./features/runs/use-project-runner";
import {
  RunStreamContext,
  type RunStreamValue,
} from "./features/runs/run-stream-context";
import { SettingsPanel } from "./features/settings/SettingsPanel";
import { type LayoutId, type ThemeId } from "./features/settings/model";
import { I18nProvider, translate } from "./i18n";
import type { Language, TranslationKey } from "./i18n";
import { errorMessage } from "./shared/errors";
import type { RuntimeStatus } from "./app/LocalActivityPanel";
import {
  cancelScheduledAnimationFrame,
  scheduleAnimationFrame,
} from "./shared/animation";
import {
  persistLocalPreferences,
  readLocalPreferences,
  type LocalPreferences,
} from "./app/preferences";
import type {
  ProfileAction,
  ProjectCommand,
  ProjectSnapshot,
  RunFinished,
  WorkspaceSnapshot,
} from "./bridge";
import "./app.css";

const EMPTY_OUTPUT_LINES: string[] = [];

export default function App() {
  const nativeRuntime = isTauriRuntime();
  const [preferences] = useState<LocalPreferences>(readLocalPreferences);
  const initialRootPath =
    preferences.rootPath?.trim() || (nativeRuntime ? "" : DEMO_WORKSPACE_ROOT);
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
  const [hiddenInspectorSections, setHiddenInspectorSections] = useState<
    InspectorSectionId[]
  >(preferences.hiddenInspectorSections ?? []);
  const { projectMeta, ensureProjectMeta, updateProjectMeta } =
    useProjectMetaState(preferences.projectMeta ?? {});
  const [initialSnapshot] = useState<WorkspaceSnapshot>(() =>
    nativeRuntime
      ? emptySnapshot(initialRootPath)
      : demoSnapshot(initialRootPath),
  );
  const [error, setError] = useState<string | null>(null);
  const [runHistoryRefreshToken, setRunHistoryRefreshToken] = useState(0);
  const inspectorResetRef = useRef<() => void>(() => undefined);
  const mainColumnRef = useRef<HTMLElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const [mainScrollThumb, setMainScrollThumb] = useState({
    visible: false,
    top: 0,
    height: 0,
  });

  const updateMainScrollThumb = useCallback(() => {
    const mainColumn = mainColumnRef.current;
    if (!mainColumn) return;

    const viewportHeight = mainColumn.clientHeight;
    const contentHeight = mainColumn.scrollHeight;
    const trackInset = 7;
    const trackHeight = Math.max(0, viewportHeight - trackInset * 2);

    if (contentHeight <= viewportHeight + 1 || trackHeight <= 0) {
      setMainScrollThumb((current) =>
        current.visible ? { visible: false, top: 0, height: 0 } : current,
      );
      return;
    }

    const height = Math.max(
      28,
      Math.min(trackHeight, (trackHeight * viewportHeight) / contentHeight),
    );
    const travel = Math.max(0, trackHeight - height);
    const scrollRange = Math.max(1, contentHeight - viewportHeight);
    const top = trackInset + (mainColumn.scrollTop / scrollRange) * travel;

    setMainScrollThumb((current) =>
      current.visible &&
      Math.abs(current.top - top) < 0.5 &&
      Math.abs(current.height - height) < 0.5
        ? current
        : { visible: true, top, height },
    );
  }, []);

  useLayoutEffect(() => {
    const mainColumn = mainColumnRef.current;
    if (!mainColumn) return;

    const scheduleScrollThumbUpdate = () => {
      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = scheduleAnimationFrame(() => {
        scrollFrameRef.current = null;
        updateMainScrollThumb();
      });
    };

    scheduleScrollThumbUpdate();
    mainColumn.addEventListener("scroll", scheduleScrollThumbUpdate, {
      passive: true,
    });

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleScrollThumbUpdate);
    resizeObserver?.observe(mainColumn);

    const mutationObserver = new MutationObserver(scheduleScrollThumbUpdate);
    mutationObserver.observe(mainColumn, { childList: true, subtree: true });

    return () => {
      mainColumn.removeEventListener("scroll", scheduleScrollThumbUpdate);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      if (scrollFrameRef.current !== null) {
        cancelScheduledAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [updateMainScrollThumb]);

  const handleWorkspaceError = useCallback(
    (message: string | null) => setError(message),
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
    onProjectSelected: resetProjectInspection,
    onSnapshotApplied: ensureProjectMeta,
  });
  const handleRunFinished = useCallback(
    (finished: RunFinished) => {
      setRunHistoryRefreshToken((token) => token + 1);
      if (
        finished.status !== "succeeded" ||
        finished.profileAction !== "build"
      ) {
        return;
      }
      const project = snapshot.projects.find(
        (candidate) => candidate.id === finished.projectId,
      );
      if (project) void refreshProject(project);
    },
    [refreshProject, snapshot.projects],
  );

  const {
    reset: resetProjectInspectionState,
    agentPrompt,
    isAgentPromptForGuidanceUpdate,
    isAgentPromptCopied,
    isWritingGuidance,
    cleanupFeedback,
    cleanupSelection,
    cleanupConfirmation,
    cleanupProgress,
    setCleanupSelection,
    isCleaningArtifacts,
    generateGuidance: handleGenerateGuidance,
    cleanArtifacts: handleCleanArtifacts,
    cancelCleanup,
    confirmCleanup,
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
    activeRuns,
    lastFinishedRun,
    outputLines,
    runProjectCommand: handleRun,
    stopRun: handleStopRun,
    stopActiveRun: handleStop,
  } = useProjectRunner({
    nativeRuntime,
    selectedProject,
    language,
    onError: handleWorkspaceError,
    onFinished: handleRunFinished,
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
      hiddenInspectorSections,
    });
  }, [
    excludeNames,
    hiddenInspectorSections,
    language,
    layout,
    projectMeta,
    rootPath,
    theme,
    workspacePaths,
  ]);

  const handleToggleInspectorSection = useCallback(
    (sectionId: InspectorSectionId) => {
      setHiddenInspectorSections((current) =>
        current.includes(sectionId)
          ? current.filter((hidden) => hidden !== sectionId)
          : [...current, sectionId],
      );
    },
    [],
  );

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

  const handleOpenProjectAction = useCallback(
    async (
      action: ProjectAction,
      project: ProjectSnapshot,
      linkId?: string,
    ) => {
      try {
        await openProjectAction(action, project, linkId);
      } catch (openError) {
        setError(errorMessage(openError));
      }
    },
    [],
  );

  const handleOpenArtifact = useCallback(
    (projectPath: string, profileId: string, relativePath: string) => {
      void bridge
        .openArtifact(projectPath, profileId, relativePath)
        .catch((openError) => {
          setError(errorMessage(openError));
        });
    },
    [],
  );

  const handleLayoutChange = useCallback(
    (nextLayout: LayoutId) => {
      setLayout(nextLayout);
      if (activePage !== "settings") {
        setActivePage("projects");
      }
    },
    [activePage],
  );

  const headingForPage = (page: PageId) =>
    page === "settings"
      ? {
          title: t("settingsTitle"),
          body: t("settingsSubtitle"),
        }
      : page === "git"
        ? {
            title: t("gitHistoryTitle"),
            body: t("gitHistoryDescription"),
          }
        : {
            title: t("projectsInView"),
            body: t("factsSubtitle"),
          };
  const globalActiveRun = activeRuns[0];
  const globalActiveRunProject = globalActiveRun
    ? snapshot.projects.find(
        (project) => project.id === globalActiveRun.projectId,
      )
    : undefined;
  // Priority: running > scanning > error > ready. A background scan failure
  // only reaches `error` after repeated failures, so transient stalls that
  // self-heal on retry never surface.
  const runtimeStatus: RuntimeStatus = globalActiveRun
    ? {
        kind: "running",
        command: globalActiveRun.displayCommand,
        projectName: globalActiveRunProject?.name,
      }
    : isScanning
      ? { kind: "scanning" }
      : error
        ? { kind: "error", message: error }
        : { kind: "ready" };

  const handleToggleFavorite = useCallback(
    (id: string) =>
      updateProjectMeta(id, {
        favorite: !projectMeta[id]?.favorite,
      }),
    [projectMeta, updateProjectMeta],
  );
  const handleToggleHidden = useCallback(
    (id: string) =>
      updateProjectMeta(id, {
        hidden: !projectMeta[id]?.hidden,
      }),
    [projectMeta, updateProjectMeta],
  );
  const projectList = useMemo<ProjectListProps>(
    () => ({
      projects: visibleProjects,
      selectedId: selectedProject?.id,
      onSelect: selectProject,
      search: projectSearch,
      setSearch: setProjectSearch,
      platformFilter,
      setPlatformFilter,
      channelFilter,
      setChannelFilter,
      projectSort,
      setProjectSort,
      showHidden: showHiddenProjects,
      setShowHidden: setShowHiddenProjects,
      filterOptions,
      projectMeta,
      onToggleFavorite: handleToggleFavorite,
      onToggleHidden: handleToggleHidden,
    }),
    [
      channelFilter,
      filterOptions,
      handleToggleFavorite,
      handleToggleHidden,
      platformFilter,
      projectMeta,
      projectSearch,
      projectSort,
      selectProject,
      selectedProject?.id,
      setChannelFilter,
      setPlatformFilter,
      setProjectSearch,
      setProjectSort,
      setShowHiddenProjects,
      showHiddenProjects,
      visibleProjects,
    ],
  );

  const handleInspectorRun = useCallback(
    (
      command: ProjectCommand,
      profileId?: string,
      profileAction?: ProfileAction,
    ) => void handleRun(command, undefined, profileId, profileAction),
    [handleRun],
  );
  const handleInspectorRefresh = useCallback(
    (project: ProjectSnapshot) => void refreshProject(project),
    [refreshProject],
  );
  const handleInspectorStop = useCallback(
    () => void handleStop(),
    [handleStop],
  );
  const handleInspectorGuidance = useCallback(
    (project: ProjectSnapshot) => void handleGenerateGuidance(project),
    [handleGenerateGuidance],
  );
  const handleCopyInspectorPrompt = useCallback(
    () => void handleCopyAgentPrompt(),
    [handleCopyAgentPrompt],
  );
  const handleInspectorCleanup = useCallback(
    (project: ProjectSnapshot) => void handleCleanArtifacts(project),
    [handleCleanArtifacts],
  );
  const handleInspectorConfirmCleanup = useCallback(
    () => void confirmCleanup(),
    [confirmCleanup],
  );
  const handleInspectorProjectAction = useCallback(
    (action: ProjectAction, project: ProjectSnapshot, linkId?: string) =>
      void handleOpenProjectAction(action, project, linkId),
    [handleOpenProjectAction],
  );
  const handleScanWorkspace = useCallback(
    () => void scanWorkspace(),
    [scanWorkspace],
  );
  const runStreamValue = useMemo<RunStreamValue>(
    () => ({
      activeRun,
      outputLines: activeRun ? outputLines : EMPTY_OUTPUT_LINES,
    }),
    [activeRun, outputLines],
  );
  const inspector = useMemo<ProjectInspectorProps>(
    () => ({
      project: selectedProject,
      details:
        inspectorProject?.id === selectedProject?.id
          ? inspectorProject
          : undefined,
      isLoading: isLoadingDetails,
      lastFinishedRun,
      runHistoryRefreshToken,
      onRunHistoryError: handleWorkspaceError,
      onRun: handleInspectorRun,
      onRefreshProject: handleInspectorRefresh,
      isRefreshing: refreshingProjectId === selectedProject?.id,
      onStop: handleInspectorStop,
      onGenerateGuidance: handleInspectorGuidance,
      agentPrompt,
      isAgentPromptForGuidanceUpdate,
      isAgentPromptCopied,
      onCopyAgentPrompt: handleCopyInspectorPrompt,
      isWritingGuidance,
      cleanupFeedback,
      cleanupSelection,
      cleanupConfirmation,
      cleanupProgress,
      onCleanupSelectionChange: setCleanupSelection,
      isCleaningArtifacts,
      onCleanArtifacts: handleInspectorCleanup,
      onCancelCleanup: cancelCleanup,
      onConfirmCleanup: handleInspectorConfirmCleanup,
      onOpenArtifact: handleOpenArtifact,
      onOpenProjectAction: handleInspectorProjectAction,
      hiddenInspectorSections,
    }),
    [
      agentPrompt,
      cancelCleanup,
      cleanupConfirmation,
      cleanupFeedback,
      cleanupProgress,
      cleanupSelection,
      handleCopyInspectorPrompt,
      handleInspectorCleanup,
      handleInspectorConfirmCleanup,
      handleInspectorGuidance,
      handleInspectorProjectAction,
      handleInspectorRefresh,
      handleInspectorRun,
      handleInspectorStop,
      handleOpenArtifact,
      handleWorkspaceError,
      hiddenInspectorSections,
      inspectorProject,
      isAgentPromptCopied,
      isAgentPromptForGuidanceUpdate,
      isCleaningArtifacts,
      isLoadingDetails,
      isWritingGuidance,
      lastFinishedRun,
      refreshingProjectId,
      runHistoryRefreshToken,
      selectedProject,
      setCleanupSelection,
    ],
  );

  return (
    <I18nProvider value={i18nValue}>
      <RunStreamContext.Provider value={runStreamValue}>
        <div className="app-shell" data-theme={theme} data-layout={layout}>
          <AppSidebar
            activePage={activePage}
            onPageChange={setActivePage}
            status={runtimeStatus}
            onStop={() =>
              globalActiveRun ? handleStopRun(globalActiveRun.runId) : undefined
            }
          />

          <div className="main-column-shell">
            <main ref={mainColumnRef} className="main-column">
              <PageTransition pageKey={activePage}>
                {(page) => {
                  const heading = headingForPage(page);
                  return (
                    <div className="page-view" data-page={page}>
                      <header className="topbar">
                        <div className="page-heading">
                          <h1>{heading.title}</h1>
                          <p>{heading.body}</p>
                        </div>
                      </header>

                      {page === "settings" ? (
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
                          onScan={handleScanWorkspace}
                          isScanning={isScanning}
                          hiddenInspectorSections={hiddenInspectorSections}
                          onToggleInspectorSection={
                            handleToggleInspectorSection
                          }
                        />
                      ) : page === "git" ? (
                        <GitHistoryView
                          key={selectedProject?.id ?? "none"}
                          projects={snapshot.projects}
                          selectedId={selectedProject?.id}
                          onSelect={selectProject}
                        />
                      ) : (
                        <ProjectsPage
                          layout={layout}
                          snapshot={snapshot}
                          visibleProjects={visibleProjects}
                          projectList={projectList}
                          inspector={inspector}
                        />
                      )}
                    </div>
                  );
                }}
              </PageTransition>
            </main>
            {mainScrollThumb.visible ? (
              <div className="main-scrollbar" aria-hidden="true">
                <span
                  className="main-scrollbar-thumb"
                  style={{
                    height: `${mainScrollThumb.height}px`,
                    transform: `translateY(${mainScrollThumb.top}px)`,
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      </RunStreamContext.Provider>
    </I18nProvider>
  );
}
