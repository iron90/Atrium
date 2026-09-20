import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppSidebar } from "./app/AppSidebar";
import { type PageId } from "./app/navigation";
import { ProjectsPage } from "./app/ProjectsPage";
import { bridge, isTauriRuntime } from "./bridge";
import { DEMO_WORKSPACE_ROOT, demoSnapshot } from "./bridge/fake-bridge";
import { GitHistoryView } from "./features/git/GitHistoryView";
import type { ProjectInspectorProps } from "./features/projects/ProjectInspector";
import type { ProjectListProps } from "./features/projects/ProjectList";
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
import { SettingsPanel } from "./features/settings/SettingsPanel";
import { type LayoutId, type ThemeId } from "./features/settings/model";
import { I18nProvider, translate } from "./i18n";
import type { Language, TranslationKey } from "./i18n";
import { errorMessage } from "./shared/errors";
import {
  persistLocalPreferences,
  readLocalPreferences,
  type LocalPreferences,
} from "./app/preferences";
import type { ProjectSnapshot, RunFinished, WorkspaceSnapshot } from "./bridge";
import "./app.css";

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
  const { projectMeta, ensureProjectMeta, updateProjectMeta } =
    useProjectMetaState(preferences.projectMeta ?? {});
  const [initialSnapshot] = useState<WorkspaceSnapshot>(() =>
    nativeRuntime
      ? emptySnapshot(initialRootPath)
      : demoSnapshot(initialRootPath),
  );
  const [error, setError] = useState<string | null>(null);
  const inspectorResetRef = useRef<() => void>(() => undefined);

  const handleWorkspaceError = useCallback(
    (message: string | null) => setError(message),
    [],
  );
  const handleWorkspaceMessage = useCallback(() => undefined, []);
  const handleRunMessage = useCallback(() => undefined, []);
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
  const handleRunFinished = useCallback(
    (finished: RunFinished) => {
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
    outputLines,
    runProjectCommand: handleRun,
    stopRun: handleStopRun,
    stopActiveRun: handleStop,
  } = useProjectRunner({
    nativeRuntime,
    selectedProject,
    language,
    onError: handleWorkspaceError,
    onMessage: handleRunMessage,
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
  const globalActiveRun = activeRuns[0];
  const globalActiveRunProject = globalActiveRun
    ? snapshot.projects.find(
        (project) => project.id === globalActiveRun.projectId,
      )
    : undefined;

  const projectList: ProjectListProps = {
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
    onToggleFavorite: (id) =>
      updateProjectMeta(id, {
        favorite: !projectMeta[id]?.favorite,
      }),
    onToggleHidden: (id) =>
      updateProjectMeta(id, {
        hidden: !projectMeta[id]?.hidden,
      }),
  };

  const inspector: ProjectInspectorProps = {
    project: selectedProject,
    details:
      inspectorProject?.id === selectedProject?.id
        ? inspectorProject
        : undefined,
    isLoading: isLoadingDetails,
    activeRun,
    outputLines,
    onRun: (command, profileId, profileAction) =>
      void handleRun(command, undefined, profileId, profileAction),
    onRefreshProject: (project) => void refreshProject(project),
    isRefreshing: refreshingProjectId === selectedProject?.id,
    onStop: () => void handleStop(),
    onGenerateGuidance: (project) => void handleGenerateGuidance(project),
    agentPrompt,
    isAgentPromptForGuidanceUpdate,
    isAgentPromptCopied,
    onCopyAgentPrompt: () => void handleCopyAgentPrompt(),
    isWritingGuidance,
    cleanupFeedback,
    cleanupSelection,
    cleanupConfirmation,
    cleanupProgress,
    onCleanupSelectionChange: setCleanupSelection,
    isCleaningArtifacts,
    onCleanArtifacts: (project) => void handleCleanArtifacts(project),
    onCancelCleanup: cancelCleanup,
    onConfirmCleanup: () => void confirmCleanup(),
    onOpenArtifact: handleOpenArtifact,
    onOpenProjectAction: (action, project, linkId) =>
      void handleOpenProjectAction(action, project, linkId),
  };

  return (
    <I18nProvider value={i18nValue}>
      <div className="app-shell" data-theme={theme} data-layout={layout}>
        <AppSidebar
          activePage={activePage}
          onPageChange={setActivePage}
          activity={{
            activeRun: globalActiveRun,
            onStop: () =>
              globalActiveRun
                ? handleStopRun(globalActiveRun.runId)
                : undefined,
            projectName: globalActiveRunProject?.name,
          }}
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

          <div className="page-view" data-page={activePage} key={activePage}>
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
              <ProjectsPage
                layout={layout}
                snapshot={snapshot}
                visibleProjects={visibleProjects}
                projectList={projectList}
                inspector={inspector}
              />
            )}
          </div>
        </main>
      </div>
    </I18nProvider>
  );
}
