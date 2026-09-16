import { useCallback, useEffect, useMemo, useState } from "react";
import { bridge, isTauriRuntime } from "./bridge";
import { demoSnapshot } from "./bridge/fake-bridge";
import { GitHistoryView } from "./features/git/GitHistoryView";
import { ProjectInspector } from "./features/projects/ProjectInspector";
import { PlatformMatrix } from "./features/projects/PlatformMatrix";
import { ProjectList } from "./features/projects/ProjectList";
import {
  collectFilterOptions,
  emptySnapshot,
  filterAndSortProjects,
  metaForProject,
  reorderProjectMeta,
  type ProjectMeta,
  type ProjectSort,
} from "./features/projects/model";
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

const createConfigurationAgentPrompt = (
  project: ProjectSnapshot,
  reportPaths: string[],
  language: Language,
): string => {
  const configurationPath =
    reportPaths.find((path) => path.endsWith("project-configuration.md")) ??
    ".atrium/reports/project-configuration.md";
  const iconPath =
    reportPaths.find((path) => path.endsWith("icon-conformance.md")) ??
    ".atrium/reports/icon-conformance.md";

  if (language === "zh") {
    return `你是项目「${project.name}」的开发 Agent，项目目录为：${project.path}

请先读取仓库中的以下 Atrium 引导文件：
- ${configurationPath}
- ${iconPath}

请根据引导文件和项目当前实际情况，完成 Atrium 接入配置：
1. 创建或修正 .atrium/manifest.toml。
2. 只声明项目真实支持的平台和渠道，不要猜测或补充不存在的目标。
3. 为每个平台 × 渠道组合绑定项目中已经存在的 Run、Check、Build 命令，不要在 Atrium 中重新发明构建命令。
4. 按 icon.v1 引导声明项目的标准图标路径，同时保持项目原有模板和构建流程不被破坏。
5. 为每个构建配置声明项目实际生成的文件或目录到 artifacts；Atrium 不会根据框架默认目录猜测产物。
6. 根据项目实际结构补充 [cleanup] 中可安全重建的缓存和构建目录；没有明确目录时不要猜测。
7. 检查 manifest、图标路径、命令引用、产物声明和清理声明是否有效，并运行适合本项目的验证命令。

不要修改 Git 历史。完成后请汇报修改过的文件、声明的平台/渠道、命令绑定以及验证结果。`;
  }

  return `You are the development Agent for the project "${project.name}" at ${project.path}

First read these Atrium guidance files from the repository:
- ${configurationPath}
- ${iconPath}

Complete the Atrium integration based on the guidance and the project's actual structure:
1. Create or update .atrium/manifest.toml.
2. Declare only platforms and channels that this project genuinely supports; do not invent targets.
3. Bind each platform × channel combination to existing project Run, Check, and Build commands. Do not invent replacement commands in Atrium.
4. Declare the canonical project icon according to the icon.v1 guidance while preserving the project's normal template and build pipeline.
5. Declare the files or directories actually produced by each build profile in artifacts; Atrium does not infer artifacts from framework defaults.
6. Add only cache and build directories that are safe to regenerate to [cleanup] based on the project's actual structure; do not guess when there is no clear directory.
7. Validate the manifest, icon path, command references, artifact declarations, and cleanup declarations, then run the checks appropriate for this project.

Do not rewrite Git history. When finished, report the files changed, declared platforms/channels, command bindings, and validation results.`;
};

const navItems: Array<{
  id: PageId;
  labelKey: TranslationKey;
  glyph: string;
}> = [
  { id: "projects", labelKey: "projects", glyph: "▦" },
  { id: "git", labelKey: "gitHistory", glyph: "⌘" },
  { id: "settings", labelKey: "settings", glyph: "⚙" },
];

type RunMessage = ProjectRunMessage | WorkspaceMessage;

const formatRunMessage = (message: RunMessage, language: Language): string => {
  switch (message.type) {
    case "ready":
      return translate(language, "readyMessage");
    case "projects":
      return fill(
        translate(language, "projectsDiscovered"),
        "count",
        String(message.count),
      );
    case "workspaceUpdated":
      return fill(
        translate(language, "workspaceUpdated"),
        "count",
        String(message.count),
      );
    case "localized":
      return translate(language, message.key);
    case "projectRefreshed":
      return translate(language, "projectRefreshed");
    case "refreshingWorkspace":
      return translate(language, "refreshingWorkspace");
    case "scanning":
      return translate(language, "scanningWorkspace");
    case "cancelled":
      return translate(language, "runCancellationRequested");
    case "command": {
      const label =
        message.commandKind === "run"
          ? translate(language, "run")
          : message.commandKind === "check"
            ? translate(language, "check")
            : message.commandKind === "build"
              ? translate(language, "build")
              : message.label;
      return `${label} · ${message.displayCommand}`;
    }
    case "demo":
      return `${message.displayCommand} · ${translate(language, "succeeded")}`;
    case "finished":
      return `${message.displayCommand} · ${translate(language, message.status)}`;
  }
};

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
  const [projectMeta, setProjectMeta] = useState<Record<string, ProjectMeta>>(
    preferences.projectMeta ?? {},
  );
  const [projectSearch, setProjectSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [projectSort, setProjectSort] = useState<ProjectSort>("manual");
  const [showHiddenProjects, setShowHiddenProjects] = useState(false);
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
  const [runMessage, setRunMessage] = useState<RunMessage>({ type: "ready" });

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
  const ensureProjectMeta = useCallback((nextSnapshot: WorkspaceSnapshot) => {
    setProjectMeta((current) => {
      const next = { ...current };
      nextSnapshot.projects.forEach((project, index) => {
        if (!next[project.id]) {
          next[project.id] = {
            favorite: false,
            hidden: false,
            order: index,
          };
        }
      });
      return next;
    });
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

  const filterOptions = useMemo(
    () => collectFilterOptions(snapshot.projects),
    [snapshot.projects],
  );

  const visibleProjects = useMemo(
    () =>
      filterAndSortProjects(snapshot.projects, projectMeta, {
        search: projectSearch,
        platform: platformFilter,
        channel: channelFilter,
        sort: projectSort,
        showHidden: showHiddenProjects,
      }),
    [
      channelFilter,
      platformFilter,
      projectMeta,
      projectSearch,
      projectSort,
      showHiddenProjects,
      snapshot.projects,
    ],
  );

  const updateProjectMeta = useCallback(
    (projectId: string, change: Partial<ProjectMeta>) => {
      setProjectMeta((current) => ({
        ...current,
        [projectId]: {
          ...metaForProject(current, projectId, snapshot.projects.length),
          ...change,
        },
      }));
    },
    [snapshot.projects.length],
  );

  const reorderProjects = useCallback(
    (orderedVisibleIds: string[]) => {
      setProjectMeta((current) => {
        return (
          reorderProjectMeta(snapshot.projects, current, orderedVisibleIds) ??
          current
        );
      });
    },
    [snapshot.projects],
  );

  const moveProjectByKeyboard = useCallback(
    (projectId: string, direction: "up" | "down") => {
      const orderedIds = visibleProjects.map((project) => project.id);
      const index = orderedIds.indexOf(projectId);
      const nextIndex = index + (direction === "up" ? -1 : 1);
      if (index < 0 || nextIndex < 0 || nextIndex >= orderedIds.length) {
        return false;
      }
      [orderedIds[index], orderedIds[nextIndex]] = [
        orderedIds[nextIndex],
        orderedIds[index],
      ];
      reorderProjects(orderedIds);
      return true;
    },
    [reorderProjects, visibleProjects],
  );

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
                      updateProjectMeta(id, {
                        favorite: !metaForProject(projectMeta, id, 0).favorite,
                      })
                    }
                    onToggleHidden={(id) =>
                      updateProjectMeta(id, {
                        hidden: !metaForProject(projectMeta, id, 0).hidden,
                      })
                    }
                    onReorder={reorderProjects}
                    onKeyboardMove={moveProjectByKeyboard}
                  />
                )}

                <div className="local-activity">
                  <div className="activity-heading">
                    <span className="eyebrow">{t("localActivity")}</span>
                    <span>{formatRunMessage(runMessage, language)}</span>
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
