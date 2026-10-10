import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { openRunningWebService } from "./features/projects/web-service";
import { useProjectInspectorActions } from "./features/projects/use-project-inspector-actions";
import { emptySnapshot } from "./features/projects/workspace-snapshot";
import { useProjectMetaState } from "./features/projects/use-project-meta-state";
import { useProjectListViewState } from "./features/projects/use-project-list-view-state";
import { useProjectWorkspace } from "./features/projects/use-project-workspace";
import {
  WORKSPACE_REFRESH_DEFAULT_MS,
  isWorkspaceRefreshMs,
  type WorkspaceRefreshMs,
} from "./features/projects/workspace-refresh";
import { useProjectRunner } from "./features/runs/use-project-runner";
import {
  RunStreamContext,
  type RunStreamValue,
} from "./features/runs/run-stream-context";
import { SettingsPanel } from "./features/settings/SettingsPanel";
import { useAppUpdate } from "./features/settings/use-app-update";
import { type ThemeId } from "./features/settings/model";
import { I18nProvider, translate } from "./i18n";
import type { Language, TranslationKey } from "./i18n";
import { errorMessage } from "./shared/errors";
import { ScrollArea } from "./shared/ScrollArea";
import type { RuntimeStatus } from "./app/LocalActivityPanel";
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
  const [autoCheckUpdates, setAutoCheckUpdates] = useState(
    preferences.autoCheckUpdates ?? true,
  );
  const [workspaceRefreshMs, setWorkspaceRefreshMs] =
    useState<WorkspaceRefreshMs>(
      isWorkspaceRefreshMs(preferences.workspaceRefreshMs)
        ? preferences.workspaceRefreshMs
        : WORKSPACE_REFRESH_DEFAULT_MS,
    );
  const appUpdate = useAppUpdate(autoCheckUpdates);
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
    workspaceRefreshMs,
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
    dismissAgentPrompt: handleDismissAgentPrompt,
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
      language,
      rootPath,
      workspaces: workspacePaths,
      excludeNames,
      projectMeta,
      hiddenInspectorSections,
      autoCheckUpdates,
      workspaceRefreshMs,
    });
  }, [
    autoCheckUpdates,
    excludeNames,
    hiddenInspectorSections,
    language,
    projectMeta,
    rootPath,
    theme,
    workspacePaths,
    workspaceRefreshMs,
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
    async (action: ProjectAction, project: ProjectSnapshot) => {
      try {
        await openProjectAction(action, project);
      } catch (openError) {
        setError(errorMessage(openError));
      }
    },
    [],
  );

  const handleOpenWebService = useCallback(
    (projectPath: string, profileId: string) => {
      const project =
        inspectorProject?.path === projectPath
          ? inspectorProject
          : snapshot.projects.find(
              (candidate) => candidate.path === projectPath,
            );
      const serviceUrl = project?.buildProfiles.find(
        (profile) => profile.id === profileId,
      )?.serviceUrl;
      void (async () => {
        try {
          if (isTauriRuntime()) {
            await bridge.openWebProfile(projectPath, profileId);
            return;
          }
          if (!serviceUrl) return;
          await openRunningWebService(serviceUrl);
        } catch (openError) {
          setError(errorMessage(openError));
        }
      })();
    },
    [inspectorProject, snapshot.projects],
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
  const handleDismissInspectorPrompt = useCallback(
    () => handleDismissAgentPrompt(),
    [handleDismissAgentPrompt],
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
    (action: ProjectAction, project: ProjectSnapshot) =>
      void handleOpenProjectAction(action, project),
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
      onDismissAgentPrompt: handleDismissInspectorPrompt,
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
      onOpenWebService: handleOpenWebService,
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
      handleDismissInspectorPrompt,
      handleInspectorCleanup,
      handleInspectorConfirmCleanup,
      handleInspectorGuidance,
      handleInspectorProjectAction,
      handleInspectorRefresh,
      handleInspectorRun,
      handleInspectorStop,
      handleOpenArtifact,
      handleOpenWebService,
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
        <div className="app-shell" data-theme={theme}>
          <AppSidebar
            activePage={activePage}
            onPageChange={setActivePage}
            status={runtimeStatus}
            updateAvailable={appUpdate.state.phase === "available"}
            onStop={() =>
              globalActiveRun ? handleStopRun(globalActiveRun.runId) : undefined
            }
          />

          <ScrollArea
            className="main-column-shell"
            viewportClassName="main-column"
            viewportComponent="main"
          >
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
                        language={language}
                        setLanguage={setLanguage}
                        workspacePaths={workspacePaths}
                        onWorkspacePathsChange={updateWorkspacePaths}
                        excludeNames={excludeNames}
                        setExcludeNames={setExcludeNames}
                        onScan={handleScanWorkspace}
                        isScanning={isScanning}
                        hiddenInspectorSections={hiddenInspectorSections}
                        onToggleInspectorSection={handleToggleInspectorSection}
                        appVersion={__APP_VERSION__}
                        update={appUpdate}
                        autoCheckUpdates={autoCheckUpdates}
                        onAutoCheckUpdatesChange={setAutoCheckUpdates}
                        workspaceRefreshMs={workspaceRefreshMs}
                        onWorkspaceRefreshMsChange={setWorkspaceRefreshMs}
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
          </ScrollArea>
        </div>
      </RunStreamContext.Provider>
    </I18nProvider>
  );
}
