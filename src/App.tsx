import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from "react";
import { FaDesktop, FaGlobe, FaWindows } from "react-icons/fa6";
import { SiAndroid, SiApple, SiIos, SiLinux, SiMacos } from "react-icons/si";
import { bridge, isTauriRuntime } from "./bridge";
import { demoSnapshot } from "./bridge/fake-bridge";
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
  type ProfileAction,
  type RunMessage as ProjectRunMessage,
} from "./features/runs/use-project-runner";
import { I18nProvider, localizedFacetLabel, translate, useI18n } from "./i18n";
import type { Language, TranslationKey } from "./i18n";
import type {
  BuildArtifact,
  BuildProfile,
  Facet,
  GitChangeSummary,
  GitCommit,
  ProtocolCapabilityStatus,
  ProjectCommand,
  ProjectSnapshot,
  ProjectStorage,
  RunStarted,
  StorageEntry,
  WorkspaceSnapshot,
} from "./bridge";
import "./app.css";

type ThemeId = "deep-ocean" | "mist-silver" | "warm-ink";
type LayoutId = "overview" | "matrix";
type PageId = "projects" | "git" | "settings";
type DropPosition = "before" | "after";

const DEFAULT_ROOT = "~/projects";
const PREFERENCES_STORAGE_KEY = "atrium.preferences.v1";

interface LocalPreferences {
  theme?: ThemeId;
  layout?: LayoutId;
  language?: Language;
  rootPath?: string;
  workspaces?: string[];
  excludeNames?: string[];
  projectMeta?: Record<string, ProjectMeta>;
}

const isThemeId = (value: unknown): value is ThemeId =>
  value === "deep-ocean" || value === "mist-silver" || value === "warm-ink";

const isLayoutId = (value: unknown): value is LayoutId =>
  value === "overview" || value === "matrix";

const isLanguage = (value: unknown): value is Language =>
  value === "en" || value === "zh";

const readProjectMeta = (
  value: unknown,
): Record<string, ProjectMeta> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const result: Record<string, ProjectMeta> = {};
  Object.entries(value).forEach(([projectId, rawMeta], index) => {
    if (!rawMeta || typeof rawMeta !== "object" || Array.isArray(rawMeta)) {
      return;
    }
    const meta = rawMeta as Record<string, unknown>;
    result[projectId] = {
      favorite: meta.favorite === true,
      hidden: meta.hidden === true,
      order:
        typeof meta.order === "number" && Number.isFinite(meta.order)
          ? meta.order
          : index,
    };
  });
  return result;
};

const readLocalPreferences = (): LocalPreferences => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return {};
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || typeof value !== "object") return {};
    return {
      theme: isThemeId(value.theme) ? value.theme : undefined,
      layout: isLayoutId(value.layout) ? value.layout : undefined,
      language: isLanguage(value.language) ? value.language : undefined,
      rootPath:
        typeof value.rootPath === "string" && value.rootPath.trim()
          ? value.rootPath
          : undefined,
      workspaces: Array.isArray(value.workspaces)
        ? value.workspaces.filter(
            (path): path is string =>
              typeof path === "string" && Boolean(path.trim()),
          )
        : undefined,
      excludeNames: Array.isArray(value.excludeNames)
        ? value.excludeNames.filter(
            (name): name is string =>
              typeof name === "string" && Boolean(name.trim()),
          )
        : undefined,
      projectMeta: readProjectMeta(value.projectMeta),
    };
  } catch {
    return {};
  }
};

const formatTime = (timestamp: number, language: Language): string =>
  new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));

const formatRelative = (timestamp: number, language: Language): string => {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 60) {
    return language === "zh" ? `${minutes} 分钟前` : `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return language === "zh" ? `${hours} 小时前` : `${hours} hr ago`;
  }
  const days = Math.round(hours / 24);
  return language === "zh" ? `${days} 天前` : `${days} days ago`;
};

const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** unitIndex;
  const formatted =
    unitIndex === 0 || value >= 100
      ? Math.round(value).toString()
      : value.toFixed(1);
  return `${formatted} ${units[unitIndex]}`;
};

const storageKindLabel = (
  entry: StorageEntry,
  t: (key: TranslationKey) => string,
): string => (entry.kind === "cache" ? t("cache") : t("buildArtifacts"));

const artifactKindLabel = (
  artifact: BuildArtifact,
  t: (key: TranslationKey) => string,
): string => {
  switch (artifact.kind) {
    case "file":
      return t("artifactFile");
    case "directory":
      return t("artifactDirectory");
    case "missing":
      return t("artifactMissing");
    case "invalid":
      return t("artifactInvalid");
  }
};

const glyphForProject = (name: string): string => {
  if (name.toLowerCase().includes("pipeline")) return "◈";
  if (name.toLowerCase().includes("note")) return "⌁";
  if (name.toLowerCase().includes("cutout")) return "✦";
  if (name.toLowerCase().includes("rhythm")) return "∿";
  if (name.toLowerCase().includes("website")) return "◎";
  return "◇";
};

const statusLabel = (project: ProjectSnapshot, language: Language): string => {
  if (!project.repo) return translate(language, "gitNotFound");
  if (project.repo.isClean) return translate(language, "clean");
  return fill(
    translate(language, "uncommittedChanges"),
    "count",
    String(project.repo.worktreeChanges),
  );
};

const statusClass = (project: ProjectSnapshot): string => {
  if (!project.repo) return "status-muted";
  return project.repo.isClean ? "status-good" : "status-warning";
};

const syncStatusVisual = (repo: NonNullable<ProjectSnapshot["repo"]>): string =>
  `↑ ${repo.ahead ?? "—"} · ↓ ${repo.behind ?? "—"}`;

const syncStatusAriaLabel = (
  repo: NonNullable<ProjectSnapshot["repo"]>,
  language: Language,
): string => {
  if (repo.ahead === null || repo.behind === null) {
    return translate(language, "upstreamMissing");
  }
  return [
    fill(translate(language, "aheadCommits"), "count", String(repo.ahead)),
    fill(translate(language, "behindCommits"), "count", String(repo.behind)),
  ].join(" · ");
};

const syncStatusClass = (
  repo: NonNullable<ProjectSnapshot["repo"]>,
): string => {
  if (repo.ahead === null || repo.behind === null) return "status-muted";
  return repo.ahead > 0 || repo.behind > 0 ? "status-warning" : "status-good";
};

const hasConfiguredCapability = (
  project: ProjectSnapshot,
  capabilityId: string,
): boolean =>
  project.protocol.manifestStatus === "configured" &&
  project.protocol.capabilities.some(
    (capability) =>
      capability.id === capabilityId && capability.status === "configured",
  );

const hasTrustedContext = (project: ProjectSnapshot): boolean =>
  hasConfiguredCapability(project, "identity") &&
  hasConfiguredCapability(project, "context");

const commandLabel = (command: ProjectCommand, language: Language): string => {
  if (command.kind === "run") return translate(language, "run");
  if (command.kind === "check") return translate(language, "check");
  if (command.kind === "build") return translate(language, "build");
  return command.label;
};

const profileCommandId = (
  profile: BuildProfile,
  action: ProfileAction,
): string | null => {
  if (action === "run") return profile.runCommandId;
  if (action === "check") return profile.checkCommandId;
  return profile.buildCommandId;
};

const commandForProfile = (
  profile: BuildProfile,
  action: ProfileAction,
  commands: ProjectCommand[],
): ProjectCommand | undefined => {
  const commandId = profileCommandId(profile, action);
  return commandId
    ? commands.find((command) => command.id === commandId)
    : undefined;
};

const capabilityLabel = (
  id: string,
  t: (key: TranslationKey) => string,
): string => {
  switch (id) {
    case "identity":
      return t("capabilityIdentity");
    case "context":
      return t("capabilityContext");
    case "build_profiles":
      return t("capabilityBuildProfiles");
    case "cleanup":
      return t("capabilityCleanup");
    default:
      return id;
  }
};

const capabilityStatusLabel = (
  status: ProtocolCapabilityStatus,
  t: (key: TranslationKey) => string,
): string => {
  switch (status) {
    case "configured":
      return t("capabilityConfigured");
    case "partial":
      return t("capabilityPartial");
    case "missing":
      return t("capabilityMissing");
    case "invalid":
      return t("capabilityInvalid");
    case "legacy":
      return t("capabilityLegacy");
  }
};

const protocolManifestLabel = (
  status: ProjectSnapshot["protocol"]["manifestStatus"],
  t: (key: TranslationKey) => string,
): string => {
  switch (status) {
    case "configured":
      return t("protocolManifestConfigured");
    case "missing":
      return t("protocolManifestMissing");
    case "invalid":
      return t("protocolManifestInvalid");
  }
};

const fill = (value: string, key: string, replacement: string): string =>
  value.replace(`{${key}}`, replacement);

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
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        PREFERENCES_STORAGE_KEY,
        JSON.stringify({
          theme,
          layout,
          language,
          rootPath,
          workspaces: workspacePaths,
          excludeNames,
          projectMeta,
        }),
      );
    } catch {
      // Preferences are best effort; repository facts never depend on them.
    }
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

function ProjectIconView({
  project,
  variant,
}: {
  project: ProjectSnapshot;
  variant: "list" | "inspector";
}) {
  if (project.icon?.dataUrl) {
    return (
      <img
        className={`project-icon project-icon-${variant}`}
        src={project.icon.dataUrl}
        alt=""
        title={project.icon.source}
      />
    );
  }
  return (
    <span
      className={variant === "list" ? "project-glyph" : "inspector-glyph"}
      aria-hidden="true"
    >
      {glyphForProject(project.name)}
    </span>
  );
}

function ProjectList({
  projects,
  selectedId,
  onSelect,
  search,
  setSearch,
  platformFilter,
  setPlatformFilter,
  channelFilter,
  setChannelFilter,
  projectSort,
  setProjectSort,
  showHidden,
  setShowHidden,
  filterOptions,
  projectMeta,
  onToggleFavorite,
  onToggleHidden,
  onReorder,
  onKeyboardMove,
}: {
  projects: ProjectSnapshot[];
  selectedId?: string;
  onSelect: (projectId: string) => void;
  search: string;
  setSearch: (value: string) => void;
  platformFilter: string;
  setPlatformFilter: (value: string) => void;
  channelFilter: string;
  setChannelFilter: (value: string) => void;
  projectSort: ProjectSort;
  setProjectSort: (value: ProjectSort) => void;
  showHidden: boolean;
  setShowHidden: (value: boolean) => void;
  filterOptions: { platforms: Facet[]; channels: Facet[] };
  projectMeta: Record<string, ProjectMeta>;
  onToggleFavorite: (projectId: string) => void;
  onToggleHidden: (projectId: string) => void;
  onReorder: (orderedProjectIds: string[]) => void;
  onKeyboardMove: (projectId: string, direction: "up" | "down") => boolean;
}) {
  const { t } = useI18n();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    projectId: string;
    position: DropPosition;
  } | null>(null);
  const dragSessionRef = useRef<{
    projectId: string;
    originalOrderIds: string[];
    previewOrderIds: string[];
    committed: boolean;
  } | null>(null);
  const [dragOrderIds, setDragOrderIds] = useState<string[] | null>(null);
  const [dragAnnouncement, setDragAnnouncement] = useState("");
  const canReorder = projectSort === "manual";

  const orderedProjects = useMemo(() => {
    if (!dragOrderIds?.length) return projects;
    const order = new Map(
      dragOrderIds.map((projectId, index) => [projectId, index]),
    );
    if (
      order.size !== projects.length ||
      projects.some((project) => !order.has(project.id))
    ) {
      return projects;
    }
    return [...projects].sort(
      (left, right) => order.get(left.id)! - order.get(right.id)!,
    );
  }, [dragOrderIds, projects]);

  const clearDragState = () => {
    dragSessionRef.current = null;
    setDragOrderIds(null);
    setDraggingId(null);
    setDropTarget(null);
  };

  const handleRowSelect = (projectId: string) => {
    onSelect(projectId);
  };

  const dropPositionFor = (
    event: ReactDragEvent<HTMLElement>,
    targetRect: DOMRect,
  ): DropPosition => {
    const clientY = Number.isFinite(event.clientY)
      ? event.clientY
      : targetRect.top;
    return clientY <= targetRect.top + targetRect.height / 2
      ? "before"
      : "after";
  };

  const handleDragStart = (
    event: ReactDragEvent<HTMLButtonElement>,
    projectId: string,
  ) => {
    if (!canReorder) {
      event.preventDefault();
      return;
    }
    const orderIds = projects.map((project) => project.id);
    dragSessionRef.current = {
      projectId,
      originalOrderIds: orderIds,
      previewOrderIds: orderIds,
      committed: false,
    };
    setDraggingId(projectId);
    setDragOrderIds(orderIds);
    setDropTarget(null);
    setDragAnnouncement("");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", projectId);
    const dragRow = event.currentTarget.closest<HTMLElement>(
      ".project-row[data-project-id]",
    );
    if (dragRow && typeof event.dataTransfer.setDragImage === "function") {
      const rowRect = dragRow.getBoundingClientRect();
      event.dataTransfer.setDragImage(
        dragRow,
        Math.max(0, Math.min(rowRect.width, event.clientX - rowRect.left)),
        Math.max(0, Math.min(rowRect.height, event.clientY - rowRect.top)),
      );
    }
  };

  const handleDragOver = (
    event: ReactDragEvent<HTMLElement>,
    targetProjectId: string,
  ) => {
    const drag = dragSessionRef.current;
    if (!canReorder || !drag) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (targetProjectId === drag.projectId) {
      setDropTarget(null);
      return;
    }

    const targetRect = event.currentTarget.getBoundingClientRect();
    const position = dropPositionFor(event, targetRect);
    const currentIds = drag.previewOrderIds;
    const nextIds = currentIds.filter(
      (projectId) => projectId !== drag.projectId,
    );
    let insertionIndex = nextIds.indexOf(targetProjectId);
    if (position === "after") insertionIndex += 1;
    nextIds.splice(insertionIndex, 0, drag.projectId);
    if (nextIds.some((projectId, index) => projectId !== currentIds[index])) {
      drag.previewOrderIds = nextIds;
      setDragOrderIds(nextIds);
    }
    setDropTarget({ projectId: targetProjectId, position });
    const draggedProject = projects.find(
      (project) => project.id === drag.projectId,
    );
    const targetProject = projects.find(
      (project) => project.id === targetProjectId,
    );
    if (draggedProject && targetProject) {
      setDragAnnouncement(
        fill(
          fill(
            t(position === "before" ? "dragPreviewBefore" : "dragPreviewAfter"),
            "project",
            draggedProject.name,
          ),
          "target",
          targetProject.name,
        ),
      );
    }
  };

  const handleDrop = (
    event: ReactDragEvent<HTMLElement>,
    targetProjectId: string,
  ) => {
    const drag = dragSessionRef.current;
    if (!canReorder || !drag) {
      return;
    }
    event.preventDefault();
    if (targetProjectId === drag.projectId) {
      setDragAnnouncement(t("dragCancelled"));
      clearDragState();
      return;
    }
    const targetRect = event.currentTarget.getBoundingClientRect();
    const position = dropPositionFor(event, targetRect);
    const nextIds = drag.previewOrderIds.filter(
      (projectId) => projectId !== drag.projectId,
    );
    let insertionIndex = nextIds.indexOf(targetProjectId);
    if (position === "after") insertionIndex += 1;
    nextIds.splice(insertionIndex, 0, drag.projectId);
    drag.committed = true;
    if (
      nextIds.some(
        (projectId, index) => projectId !== drag.originalOrderIds[index],
      )
    ) {
      onReorder(nextIds);
      setDragAnnouncement(t("dragSaved"));
    } else {
      setDragAnnouncement(t("dragUnchanged"));
    }
    clearDragState();
  };

  const handleDragEnd = () => {
    const drag = dragSessionRef.current;
    if (!drag) return;
    if (!drag.committed) setDragAnnouncement(t("dragCancelled"));
    clearDragState();
  };

  const handleKeyboardMove = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    projectId: string,
  ) => {
    if (!canReorder) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    event.stopPropagation();
    const moved = onKeyboardMove(
      projectId,
      event.key === "ArrowUp" ? "up" : "down",
    );
    setDragAnnouncement(t(moved ? "dragSaved" : "dragUnchanged"));
  };

  return (
    <>
      <div className="project-filters">
        <input
          className="toolbar-control"
          aria-label={t("searchProjects")}
          placeholder={t("searchProjects")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="toolbar-control"
          value={platformFilter}
          onChange={(event) => setPlatformFilter(event.target.value)}
        >
          <option value="all">{t("allPlatforms")}</option>
          {filterOptions.platforms.map((facet) => (
            <option key={facet.key} value={facet.key}>
              {facet.label}
            </option>
          ))}
        </select>
        <select
          className="toolbar-control"
          value={channelFilter}
          onChange={(event) => setChannelFilter(event.target.value)}
        >
          <option value="all">{t("allChannels")}</option>
          {filterOptions.channels.map((facet) => (
            <option key={facet.key} value={facet.key}>
              {facet.label}
            </option>
          ))}
        </select>
        <select
          className="toolbar-control"
          value={projectSort}
          onChange={(event) =>
            setProjectSort(event.target.value as typeof projectSort)
          }
        >
          <option value="manual">{t("manualOrder")}</option>
          <option value="modified">{t("sortModified")}</option>
          <option value="storage">{t("sortStorage")}</option>
          <option value="name">{t("sortName")}</option>
        </select>
        <button
          type="button"
          className={`toolbar-control ${showHidden ? "is-toggle-active" : ""}`}
          onClick={() => setShowHidden(!showHidden)}
        >
          {showHidden ? t("hideHidden") : t("showHidden")}
        </button>
      </div>
      {projects.length ? (
        <>
          <div className="project-order-hint">
            <span className="project-drag-handle" aria-hidden="true">
              ⠿
            </span>
            {canReorder ? t("dragToReorder") : t("dragRequiresManual")}
            <span className="sr-only" role="status" aria-live="polite">
              {dragAnnouncement}
            </span>
          </div>
          <div
            className={`project-list ${canReorder ? "is-reorderable" : ""}`}
            role="list"
          >
            <div className="project-list-head">
              <span>{t("project")}</span>
              <span>{t("git")}</span>
              <span>{t("platforms")}</span>
              <span>{t("channels")}</span>
              <span>{t("actions")}</span>
            </div>
            {orderedProjects.map((project, index) => (
              <ProjectListRow
                key={project.id}
                project={project}
                selectedId={selectedId}
                onSelect={handleRowSelect}
                meta={metaForProject(projectMeta, project.id, index)}
                onToggleFavorite={onToggleFavorite}
                onToggleHidden={onToggleHidden}
                dragEnabled={canReorder}
                isDragging={draggingId === project.id}
                isDropTarget={
                  dropTarget?.projectId === project.id &&
                  draggingId !== project.id
                }
                dropPosition={
                  dropTarget?.projectId === project.id &&
                  draggingId !== project.id
                    ? dropTarget.position
                    : null
                }
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                onKeyboardMove={handleKeyboardMove}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="empty-state">
          <span>◇</span>
          <h3>{t("noProjects")}</h3>
          <p>{t("chooseRoot")}</p>
        </div>
      )}
    </>
  );
}

function ProjectListRow({
  project,
  selectedId,
  onSelect,
  meta,
  onToggleFavorite,
  onToggleHidden,
  dragEnabled,
  isDragging,
  isDropTarget,
  dropPosition,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onKeyboardMove,
}: {
  project: ProjectSnapshot;
  selectedId?: string;
  onSelect: (projectId: string) => void;
  meta: ProjectMeta;
  onToggleFavorite: (projectId: string) => void;
  onToggleHidden: (projectId: string) => void;
  dragEnabled: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  dropPosition: DropPosition | null;
  onDragStart: (
    event: ReactDragEvent<HTMLButtonElement>,
    projectId: string,
  ) => void;
  onDragOver: (event: ReactDragEvent<HTMLElement>, projectId: string) => void;
  onDrop: (event: ReactDragEvent<HTMLElement>, projectId: string) => void;
  onDragEnd: () => void;
  onKeyboardMove: (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    projectId: string,
  ) => void;
}) {
  const { language, t } = useI18n();
  const contextReady = hasTrustedContext(project);
  return (
    <article
      className={`project-row ${project.id === selectedId ? "is-selected" : ""} ${isDragging ? "is-dragging" : ""} ${isDropTarget ? `is-drop-target is-drop-${dropPosition}` : ""}`}
      role="listitem"
      data-project-id={project.id}
      aria-roledescription={dragEnabled ? t("draggableProject") : undefined}
      onClick={() => onSelect(project.id)}
      onDragOver={(event) => onDragOver(event, project.id)}
      onDrop={(event) => onDrop(event, project.id)}
    >
      <div className="project-select">
        <button
          className="project-drag-handle"
          type="button"
          draggable={dragEnabled}
          disabled={!dragEnabled}
          aria-label={t("dragProject")}
          title={dragEnabled ? t("dragProject") : t("dragRequiresManual")}
          onClick={(event) => event.stopPropagation()}
          onDragStart={(event) => {
            event.stopPropagation();
            onDragStart(event, project.id);
          }}
          onDragEnd={onDragEnd}
          onKeyDown={(event) => onKeyboardMove(event, project.id)}
        >
          ⠿
        </button>
        <button
          className="project-select-button"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(project.id);
          }}
        >
          <ProjectIconView project={project} variant="list" />
          <span className="project-copy">
            <strong>{project.name}</strong>
            <span>{project.description ?? project.path}</span>
          </span>
        </button>
      </div>
      <div className="git-cell">
        <span className="branch-line">
          <span aria-hidden="true">⑂</span>
          {project.repo?.branch ?? t("noRepository")}
        </span>
        <span className={statusClass(project)}>
          <span className="state-dot" />
          {statusLabel(project, language)}
        </span>
        {project.repo ? (
          <span
            className={`git-sync ${syncStatusClass(project.repo)}`}
            title={syncStatusAriaLabel(project.repo, language)}
          >
            <span aria-hidden="true">{syncStatusVisual(project.repo)}</span>
            <span className="sr-only">
              {syncStatusAriaLabel(project.repo, language)}
            </span>
          </span>
        ) : null}
      </div>
      <FacetChips
        facets={contextReady ? project.platforms : []}
        emptyKey="notDetected"
        kind="platform"
      />
      <FacetChips
        facets={contextReady ? project.channels : []}
        emptyKey="noEvidence"
        kind="channel"
      />
      <div
        className="project-row-actions"
        role="group"
        aria-label={t("actions")}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite(project.id);
          }}
          title={t("favorite")}
        >
          {meta.favorite ? "★" : "☆"}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleHidden(project.id);
          }}
          title={meta.hidden ? t("restoreProject") : t("hideProject")}
        >
          {meta.hidden ? "◉" : "◌"}
        </button>
      </div>
    </article>
  );
}

function FacetChips({
  facets,
  emptyKey,
  kind,
}: {
  facets: Facet[];
  emptyKey: "notDetected" | "noEvidence";
  kind: "platform" | "channel";
}) {
  const { language, t } = useI18n();
  return (
    <div className="facet-cell">
      {facets.length ? (
        facets.slice(0, 4).map((facet) => (
          <span
            className={`facet-chip ${kind === "platform" ? "platform-chip" : ""}`}
            key={facet.key}
            title={facetTitle(language, facet)}
            aria-label={
              kind === "platform"
                ? localizedFacetLabel(language, facet.key, facet.label)
                : undefined
            }
          >
            <FacetMark facet={facet} kind={kind} />
            {kind === "channel"
              ? localizedFacetLabel(language, facet.key, facet.label)
              : null}
          </span>
        ))
      ) : (
        <span className="muted-inline">{t(emptyKey)}</span>
      )}
    </div>
  );
}

function FacetMark({
  facet,
  kind,
}: {
  facet: Facet;
  kind: "platform" | "channel";
}) {
  if (kind === "channel") {
    return <span className={`facet-source source-${facet.source}`} />;
  }

  return (
    <span
      className={`platform-mark source-${facet.source}`}
      data-platform={normalizePlatformKey(facet.key)}
      aria-hidden="true"
    >
      <PlatformGlyph platformKey={facet.key} />
    </span>
  );
}

function normalizePlatformKey(platformKey: string): string {
  return platformKey.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function PlatformGlyph({ platformKey }: { platformKey: string }) {
  const normalizedKey = normalizePlatformKey(platformKey);
  const props = {
    className: "platform-mark-icon",
    "aria-hidden": true,
    "data-platform-glyph": normalizedKey,
  };

  switch (normalizedKey) {
    case "android":
      return <SiAndroid {...props} />;
    case "apple":
      return <SiApple {...props} />;
    case "ios":
      return <SiIos {...props} />;
    case "ipad":
    case "ipados":
      return (
        <span
          className="platform-wordmark"
          aria-hidden="true"
          data-platform-glyph={normalizedKey}
        >
          iPadOS
        </span>
      );
    case "linux":
      return <SiLinux {...props} />;
    case "macos":
      return <SiMacos {...props} />;
    case "web":
      return <FaGlobe {...props} />;
    case "windows":
      return <FaWindows {...props} />;
    default:
      return <FaDesktop {...props} />;
  }
}

function facetTitle(language: Language, facet: Facet): string {
  const label = localizedFacetLabel(language, facet.key, facet.label);
  return facet.evidence.length
    ? `${label} · ${facet.evidence.join(", ")}`
    : label;
}

function ProjectInspector({
  project,
  details,
  isLoading,
  activeRun,
  outputLines,
  onRun,
  onRefreshProject,
  isRefreshing,
  onStop,
  onGenerateGuidance,
  guidanceMessage,
  agentPrompt,
  isAgentPromptCopied,
  onCopyAgentPrompt,
  isWritingGuidance,
  cleanupFeedback,
  cleanupSelection,
  onCleanupSelectionChange,
  isCleaningArtifacts,
  onCleanArtifacts,
  onOpenArtifact,
  onOpenProjectAction,
}: {
  project?: ProjectSnapshot;
  details?: ProjectSnapshot;
  isLoading: boolean;
  activeRun?: RunStarted;
  outputLines: string[];
  onRun: (
    command: ProjectCommand,
    profileId?: string,
    profileAction?: ProfileAction,
  ) => void;
  onRefreshProject: (project: ProjectSnapshot) => void;
  isRefreshing: boolean;
  onStop: () => void;
  onGenerateGuidance: (project: ProjectSnapshot) => void;
  guidanceMessage: string | null;
  agentPrompt: string | null;
  isAgentPromptCopied: boolean;
  onCopyAgentPrompt: () => void;
  isWritingGuidance: boolean;
  cleanupFeedback: {
    removedBytes: number;
    failedCount: number;
  } | null;
  cleanupSelection: string[];
  onCleanupSelectionChange: (paths: string[]) => void;
  isCleaningArtifacts: boolean;
  onCleanArtifacts: (project: ProjectSnapshot) => void;
  onOpenArtifact: (
    projectPath: string,
    profileId: string,
    relativePath: string,
  ) => void;
  onOpenProjectAction: (
    action: "directory" | "terminal" | "remote" | "link",
    project: ProjectSnapshot,
    linkId?: string,
  ) => void;
}) {
  const { language, t } = useI18n();
  const [rawCommandsRevealedFor, setRawCommandsRevealedFor] = useState<
    string | null
  >(null);

  if (!project) {
    return (
      <aside className="inspector empty-inspector">
        <span>◇</span>
        <p>{t("selectProject")}</p>
      </aside>
    );
  }

  const inspectedProject = details ?? project;
  const rawCommandsRevealed = rawCommandsRevealedFor === project.id;
  const buildProfiles = inspectedProject.buildProfiles;
  const iconConformance = inspectedProject.iconConformance;
  const protocol = inspectedProject.protocol;
  const coreCapabilities = protocol.capabilities.filter(
    (capability) => capability.id !== "cleanup",
  );
  const protocolReady =
    protocol.manifestStatus === "configured" &&
    coreCapabilities.length > 0 &&
    coreCapabilities.every((capability) => capability.status === "configured");
  const protocolCardStatus =
    protocol.manifestStatus !== "configured"
      ? protocol.manifestStatus
      : protocol.capabilities.some(
            (capability) => capability.status !== "configured",
          )
        ? "partial"
        : "configured";
  const protocolDetailsSummary = fill(
    t("protocolDetailsSummary"),
    "count",
    String(protocol.capabilities.length),
  );
  const canExecuteProfiles =
    inspectedProject.configuration.status === "configured";
  const showConfigurationGuidance =
    !canExecuteProfiles || buildProfiles.length === 0;
  const cleanupCapability = protocol.capabilities.find(
    (capability) => capability.id === "cleanup",
  );
  const showProtocolGuidance =
    !protocolReady ||
    showConfigurationGuidance ||
    cleanupCapability?.status === "invalid";
  const primaryCommands = inspectedProject.commands.filter(
    (command) => command.kind !== "other",
  );
  const otherCommands = inspectedProject.commands.filter(
    (command) => command.kind === "other",
  );
  const repo = inspectedProject.repo;
  const storage = inspectedProject.storage;

  return (
    <aside className="inspector">
      <div className="inspector-header">
        <ProjectIconView project={project} variant="inspector" />
        <div>
          <span className="eyebrow">{t("selectedProject")}</span>
          <h2>{project.name}</h2>
          <p>{project.description ?? t("descriptionMissing")}</p>
        </div>
        <button
          className="inspector-refresh"
          type="button"
          onClick={() => onRefreshProject(project)}
          disabled={isRefreshing}
          title={t("refreshProject")}
        >
          {isRefreshing ? "↻" : "⟳"}
          <span className="sr-only">
            {isRefreshing ? t("refreshingProject") : t("refreshProject")}
          </span>
        </button>
      </div>

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

      <InspectorSection title={t("projectTools")}>
        <div className="project-tool-bar">
          <button
            type="button"
            onClick={() => onOpenProjectAction("directory", inspectedProject)}
          >
            {t("openFolder")}
          </button>
          <button
            type="button"
            onClick={() => onOpenProjectAction("terminal", inspectedProject)}
          >
            {t("openTerminal")}
          </button>
          {repo?.remote ? (
            <button
              type="button"
              onClick={() => onOpenProjectAction("remote", inspectedProject)}
            >
              {t("openRemote")}
            </button>
          ) : null}
        </div>
        {inspectedProject.links?.length ? (
          <div className="project-links">
            {inspectedProject.links.map((link) => (
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
        ) : null}
      </InspectorSection>

      <InspectorSection title={t("atriumProtocol")}>
        <div className={`protocol-card protocol-status-${protocolCardStatus}`}>
          <div>
            <strong>{protocolManifestLabel(protocol.manifestStatus, t)}</strong>
            <span>{t("iconConformanceDescription")}</span>
          </div>
          {showProtocolGuidance ? (
            <button
              className="protocol-action"
              type="button"
              onClick={() => onGenerateGuidance(project)}
              disabled={isWritingGuidance}
            >
              {isWritingGuidance
                ? t("generatingGuidance")
                : t("generateGuidance")}
            </button>
          ) : null}
        </div>
        <details className="protocol-details" key={project.id}>
          <summary>
            <span>{t("protocolDetails")}</span>
            <span>{protocolDetailsSummary}</span>
          </summary>
          <div className="protocol-details-body">
            <div className="protocol-path">
              <span>{protocol.manifestPath}</span>
              <span>
                {protocol.schema
                  ? fill(
                      t("protocolSchema"),
                      "version",
                      String(protocol.schema),
                    )
                  : t("protocolSchemaUnavailable")}
              </span>
            </div>
            <div
              className="protocol-capabilities"
              aria-label={t("protocolCapabilities")}
            >
              {protocol.capabilities.map((capability) => (
                <div
                  className={`protocol-capability capability-${capability.status}`}
                  key={capability.id}
                  title={
                    capability.issues.join(" ") ||
                    capability.evidence.join(", ")
                  }
                >
                  <span className="capability-dot" />
                  <span>
                    <strong>{capabilityLabel(capability.id, t)}</strong>
                    <small>{capabilityStatusLabel(capability.status, t)}</small>
                  </span>
                </div>
              ))}
            </div>
            <div className="protocol-path protocol-icon-path">
              <span>
                {iconConformance?.manifestPath ?? protocol.manifestPath}
              </span>
              <span>
                {iconConformance?.resolvedIcon ?? t("iconStatusMissing")}
              </span>
            </div>
          </div>
        </details>
        {guidanceMessage ? (
          <p className="protocol-message">{guidanceMessage}</p>
        ) : null}
        {agentPrompt ? (
          <div className="agent-prompt-card">
            <div className="agent-prompt-heading">
              <div>
                <strong>{t("agentPromptTitle")}</strong>
                <span>{t("agentPromptDescription")}</span>
              </div>
              <button
                className="protocol-action"
                type="button"
                onClick={onCopyAgentPrompt}
              >
                {isAgentPromptCopied
                  ? t("agentPromptCopied")
                  : t("copyAgentPrompt")}
              </button>
            </div>
            <textarea
              className="agent-prompt"
              readOnly
              value={agentPrompt}
              aria-label={t("agentPromptTitle")}
              rows={10}
            />
          </div>
        ) : null}
      </InspectorSection>

      <InspectorSection
        title={t("storage")}
        trailing={storage ? formatBytes(storage.totalBytes) : undefined}
      >
        {isLoading ? (
          <DetailLoading />
        ) : storage ? (
          <StoragePanel
            project={project}
            storage={storage}
            cleanupFeedback={cleanupFeedback}
            cleanupSelection={cleanupSelection}
            onCleanupSelectionChange={onCleanupSelectionChange}
            isCleaningArtifacts={isCleaningArtifacts}
            onCleanArtifacts={onCleanArtifacts}
          />
        ) : (
          <p className="empty-copy">{t("storageUnavailable")}</p>
        )}
      </InspectorSection>

      <InspectorSection title={t("detectedContext")}>
        {protocolReady ? (
          <>
            <FacetDetail
              label={t("platforms")}
              facets={inspectedProject.platforms}
              kind="platform"
            />
            <FacetDetail
              label={t("channels")}
              facets={inspectedProject.channels}
              kind="channel"
            />
          </>
        ) : (
          <div className="protocol-prerequisite">
            <strong>{t("protocolRequired")}</strong>
            <span>{t("protocolRequiredDescription")}</span>
          </div>
        )}
      </InspectorSection>

      <InspectorSection
        title={t("buildProfiles")}
        trailing={
          !protocolReady
            ? t("protocolRequired")
            : inspectedProject.configuration.status === "configured"
              ? fill(t("profileCount"), "count", String(buildProfiles.length))
              : t("configurationMissing")
        }
      >
        {protocolReady && buildProfiles.length ? (
          <div className="profile-list">
            {buildProfiles.map((profile) => (
              <BuildProfileCard
                key={profile.id}
                profile={profile}
                commands={inspectedProject.commands}
                artifacts={inspectedProject.artifacts ?? []}
                projectPath={inspectedProject.path}
                activeRun={activeRun}
                canExecute={canExecuteProfiles}
                onRun={onRun}
                onOpenArtifact={onOpenArtifact}
              />
            ))}
          </div>
        ) : null}
        {!protocolReady ? (
          <div className="protocol-prerequisite">
            <strong>{t("protocolRequired")}</strong>
            <span>{t("protocolRequiredDescription")}</span>
          </div>
        ) : showConfigurationGuidance ? (
          <div className="configuration-empty">
            <strong>
              {inspectedProject.configuration.status === "missing"
                ? t("manifestMissing")
                : inspectedProject.configuration.status === "invalid"
                  ? t("configurationMissing")
                  : t("noBuildProfiles")}
            </strong>
            <span>
              {inspectedProject.configuration.status === "invalid"
                ? inspectedProject.configuration.issues[0]
                : inspectedProject.configuration.manifestPath}
            </span>
          </div>
        ) : null}
      </InspectorSection>

      <InspectorSection
        title={t("rawRepositoryCommands")}
        trailing={
          isLoading
            ? t("waitingForOutput")
            : inspectedProject.commands.length
              ? fill(
                  t("source"),
                  "value",
                  inspectedProject.commands[0].source.split("#")[0],
                )
              : undefined
        }
      >
        {isLoading ? (
          <DetailLoading />
        ) : (
          <>
            <p className="entrypoint-note">{t("rawCommandDescription")}</p>
            {!inspectedProject.commands.length ? (
              <p className="empty-copy">{t("noKnownEntrypoint")}</p>
            ) : !rawCommandsRevealed ? (
              <div className="command-disclosure">
                <strong>
                  {fill(
                    t("discoveredCommandsCount"),
                    "count",
                    String(inspectedProject.commands.length),
                  )}
                </strong>
                <span>{t("discoveredCommandsWarning")}</span>
                <button
                  className="command-disclosure-button"
                  type="button"
                  onClick={() => setRawCommandsRevealedFor(project.id)}
                >
                  {t("revealDiscoveredCommands")}
                </button>
              </div>
            ) : (
              <>
                <div className="entrypoint-list">
                  {primaryCommands.length ? (
                    primaryCommands.map((command) => (
                      <button
                        className={`entrypoint-button command-${command.kind}`}
                        type="button"
                        key={command.id}
                        onClick={() => onRun(command)}
                        disabled={Boolean(activeRun)}
                        title={command.displayCommand}
                      >
                        <span className="entrypoint-icon" aria-hidden="true">
                          {command.kind === "run"
                            ? "▷"
                            : command.kind === "check"
                              ? "✓"
                              : "↗"}
                        </span>
                        <span>
                          <strong>{commandLabel(command, language)}</strong>
                          <small>{command.displayCommand}</small>
                        </span>
                        <span className="entrypoint-arrow" aria-hidden="true">
                          →
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="empty-copy">{t("noKnownEntrypoint")}</p>
                  )}
                </div>
                {otherCommands.length ? (
                  <details className="other-commands">
                    <summary>
                      {fill(
                        t("otherCommands"),
                        "count",
                        String(otherCommands.length),
                      )}
                    </summary>
                    {otherCommands.map((command) => (
                      <button
                        type="button"
                        key={command.id}
                        onClick={() => onRun(command)}
                        disabled={Boolean(activeRun)}
                      >
                        {command.displayCommand}
                      </button>
                    ))}
                  </details>
                ) : null}
              </>
            )}
          </>
        )}
      </InspectorSection>

      {activeRun ? (
        <InspectorSection
          title={t("liveOutput")}
          trailing={
            <button className="stop-link" type="button" onClick={onStop}>
              {t("stop")}
            </button>
          }
        >
          <div className="live-run">
            <span className="activity-pulse is-running" />
            <span>{activeRun.displayCommand}</span>
            <em>{t("running")}</em>
          </div>
          <pre className="output-console">
            {outputLines.length
              ? outputLines.join("\n")
              : t("waitingForOutput")}
          </pre>
        </InspectorSection>
      ) : null}

      <InspectorSection
        title={t("recentCommits")}
        trailing={
          isLoading
            ? t("waitingForOutput")
            : repo
              ? fill(t("loaded"), "count", String(repo.recentCommits.length))
              : undefined
        }
      >
        {isLoading ? (
          <DetailLoading />
        ) : repo?.recentCommits.length ? (
          <CommitList commits={repo.recentCommits.slice(0, 5)} />
        ) : (
          <p className="empty-copy">{t("gitHistoryUnavailable")}</p>
        )}
      </InspectorSection>

      <div className="inspector-footnote">
        <span className="fact-key" /> {t("detectedFacts")}
      </div>
    </aside>
  );
}

function DetailLoading() {
  const { t } = useI18n();
  return (
    <div className="details-loading" aria-label={t("loadingDetails")}>
      <span className="loading-line loading-line-long" />
      <span className="loading-line" />
      <span className="loading-line loading-line-short" />
    </div>
  );
}

function StoragePanel({
  project,
  storage,
  cleanupFeedback,
  cleanupSelection,
  onCleanupSelectionChange,
  isCleaningArtifacts,
  onCleanArtifacts,
}: {
  project: ProjectSnapshot;
  storage: ProjectStorage;
  cleanupFeedback: {
    removedBytes: number;
    failedCount: number;
  } | null;
  cleanupSelection: string[];
  onCleanupSelectionChange: (paths: string[]) => void;
  isCleaningArtifacts: boolean;
  onCleanArtifacts: (project: ProjectSnapshot) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="storage-panel">
      <div className="storage-summary">
        <div>
          <strong>{formatBytes(storage.totalBytes)}</strong>
          <span>{t("projectStorage")}</span>
        </div>
        <div>
          <strong>{formatBytes(storage.cleanableBytes)}</strong>
          <span>{t("cleanableStorage")}</span>
        </div>
      </div>

      {storage.entries.length ? (
        <>
          <div className="storage-entry-list">
            {storage.entries.map((entry) => (
              <label
                className={`storage-entry storage-${entry.kind}`}
                key={entry.relativePath}
              >
                <input
                  type="checkbox"
                  checked={cleanupSelection.includes(entry.relativePath)}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...cleanupSelection, entry.relativePath]
                      : cleanupSelection.filter(
                          (path) => path !== entry.relativePath,
                        );
                    onCleanupSelectionChange(next);
                  }}
                />
                <div>
                  <strong>{entry.relativePath}</strong>
                  <span>
                    {storageKindLabel(entry, t)} ·{" "}
                    {fill(t("storageFiles"), "count", String(entry.fileCount))}
                  </span>
                </div>
                <em>{formatBytes(entry.bytes)}</em>
              </label>
            ))}
          </div>
          <button
            className="cleanup-button"
            type="button"
            onClick={() => onCleanArtifacts(project)}
            disabled={isCleaningArtifacts || !cleanupSelection.length}
          >
            {isCleaningArtifacts ? t("cleaningArtifacts") : t("cleanSelected")}
          </button>
          {cleanupFeedback ? (
            <p
              className={`cleanup-message ${
                cleanupFeedback.failedCount ? "is-warning" : ""
              }`}
            >
              {cleanupFeedback.failedCount
                ? fill(
                    t("cleanupCompletedWithFailures"),
                    "size",
                    formatBytes(cleanupFeedback.removedBytes),
                  ).replace("{count}", String(cleanupFeedback.failedCount))
                : fill(
                    t("cleanupCompleted"),
                    "size",
                    formatBytes(cleanupFeedback.removedBytes),
                  )}
            </p>
          ) : null}
        </>
      ) : (
        <p className="empty-copy">{t("noCleanableArtifacts")}</p>
      )}
    </div>
  );
}

function BuildProfileCard({
  profile,
  commands,
  artifacts,
  projectPath,
  activeRun,
  canExecute,
  onRun,
  onOpenArtifact,
}: {
  profile: BuildProfile;
  commands: ProjectCommand[];
  artifacts: BuildArtifact[];
  projectPath: string;
  activeRun?: RunStarted;
  canExecute: boolean;
  onRun: (
    command: ProjectCommand,
    profileId?: string,
    profileAction?: ProfileAction,
  ) => void;
  onOpenArtifact: (
    projectPath: string,
    profileId: string,
    relativePath: string,
  ) => void;
}) {
  const { language, t } = useI18n();
  const actions: ProfileAction[] = ["run", "check", "build"];
  const profileReady = canExecute && profile.issues.length === 0;
  const profileArtifacts = artifacts.filter(
    (artifact) => artifact.profileId === profile.id,
  );
  return (
    <div className="profile-card">
      <div className="profile-heading">
        <div>
          <strong>{profile.label}</strong>
          <span>
            {localizedFacetLabel(
              language,
              profile.platform.key,
              profile.platform.label,
            )}
            <i aria-hidden="true">·</i>
            {localizedFacetLabel(
              language,
              profile.channel.key,
              profile.channel.label,
            )}
          </span>
        </div>
        <span className="profile-source" title={profile.source}>
          {profile.id}
        </span>
      </div>
      <div className="profile-actions">
        {actions.map((action) => {
          const command = commandForProfile(profile, action, commands);
          if (!command) return null;
          return (
            <button
              className={`profile-action command-${action}`}
              type="button"
              key={action}
              onClick={() => onRun(command, profile.id, action)}
              disabled={Boolean(activeRun) || !profileReady}
              title={
                !canExecute
                  ? t("configurationMissing")
                  : profile.issues.length
                    ? t("profileUnavailable")
                    : command.displayCommand
              }
            >
              {action === "run"
                ? t("run")
                : action === "check"
                  ? t("check")
                  : t("build")}
            </button>
          );
        })}
      </div>
      <div className="artifact-declarations">
        <span className="artifact-heading">{t("profileArtifacts")}</span>
        {profile.artifacts.length ? (
          <div className="artifact-list">
            {profile.artifacts.map((relativePath) => {
              const artifact = profileArtifacts.find(
                (candidate) => candidate.relativePath === relativePath,
              );
              const canOpen =
                artifact?.kind === "file" || artifact?.kind === "directory";
              return (
                <div className="artifact-row" key={relativePath}>
                  <span className="artifact-copy">
                    <strong>{relativePath}</strong>
                    <small>
                      {artifact
                        ? `${artifactKindLabel(artifact, t)} · ${formatBytes(artifact.bytes)} · ${fill(t("artifactFiles"), "count", String(artifact.fileCount))}`
                        : t("artifactUnavailable")}
                      {artifact?.modifiedAt
                        ? ` · ${fill(t("artifactUpdated"), "time", formatTime(artifact.modifiedAt, language))}`
                        : ""}
                    </small>
                  </span>
                  <button
                    className="artifact-open"
                    type="button"
                    disabled={!canOpen}
                    onClick={() =>
                      onOpenArtifact(projectPath, profile.id, relativePath)
                    }
                    title={
                      canOpen ? t("openArtifact") : t("artifactUnavailable")
                    }
                  >
                    {t("openArtifact")}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <span className="muted-inline">{t("noArtifactsDeclared")}</span>
        )}
      </div>
      {profile.issues.length ? (
        <span className="profile-issue">{profile.issues[0]}</span>
      ) : null}
    </div>
  );
}

function InspectorSection({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="inspector-section">
      <div className="section-heading">
        <h3>{title}</h3>
        {trailing ? <span>{trailing}</span> : null}
      </div>
      {children}
    </section>
  );
}

function FacetDetail({
  label,
  facets,
  kind,
}: {
  label: string;
  facets: Facet[];
  kind: "platform" | "channel";
}) {
  const { language, t } = useI18n();
  return (
    <div className="facet-detail">
      <span>{label}</span>
      <div>
        {facets.length ? (
          facets.map((facet) => (
            <span
              className={`detail-chip ${kind === "platform" ? "platform-detail-chip" : ""}`}
              key={facet.key}
              title={facetTitle(language, facet)}
              aria-label={
                kind === "platform"
                  ? localizedFacetLabel(language, facet.key, facet.label)
                  : undefined
              }
            >
              <FacetMark facet={facet} kind={kind} />
              {kind === "channel"
                ? localizedFacetLabel(language, facet.key, facet.label)
                : null}
            </span>
          ))
        ) : (
          <span className="muted-inline">{t("noEvidence")}</span>
        )}
      </div>
    </div>
  );
}

function CommitList({ commits }: { commits: GitCommit[] }) {
  const { language } = useI18n();
  return (
    <div className="commit-list">
      {commits.map((commit) => (
        <div className="commit-row" key={commit.sha}>
          <span className="commit-dot" />
          <span className="commit-copy">
            <strong>{commit.subject}</strong>
            <span>
              {commit.shortSha} · {commit.author}
            </span>
          </span>
          <time>{formatRelative(commit.timestamp, language)}</time>
        </div>
      ))}
    </div>
  );
}

function PlatformMatrix({
  projects,
  onSelect,
}: {
  projects: ProjectSnapshot[];
  onSelect: (projectId: string) => void;
}) {
  const { language, t } = useI18n();
  const trustedProjects = projects.filter(hasTrustedContext);
  const platforms = Array.from(
    new Map(
      trustedProjects
        .flatMap((project) => project.platforms)
        .map((facet) => [facet.key, facet]),
    ).values(),
  );
  return (
    <div className="matrix-view">
      <div className="matrix-intro">
        <span className="eyebrow">{t("detectedContext")}</span>
        <h2>{t("platformMatrix")}</h2>
        <p>{t("platformMatrixDescription")}</p>
      </div>
      <div className="matrix-table">
        <div className="matrix-head">
          <span>{t("project")}</span>
          {platforms.map((facet) => (
            <span key={facet.key}>
              {localizedFacetLabel(language, facet.key, facet.label)}
            </span>
          ))}
        </div>
        {projects.map((project) => (
          <button
            className="matrix-row"
            type="button"
            key={project.id}
            onClick={() => onSelect(project.id)}
          >
            <strong>{project.name}</strong>
            {platforms.map((facet) => (
              <span key={facet.key}>
                {hasTrustedContext(project) &&
                project.platforms.some((item) => item.key === facet.key) ? (
                  <i className="matrix-check">●</i>
                ) : (
                  <i className="matrix-empty">·</i>
                )}
              </span>
            ))}
          </button>
        ))}
      </div>
    </div>
  );
}

function GitHistoryView({
  projects,
  selectedId,
  onSelect,
}: {
  projects: ProjectSnapshot[];
  selectedId?: string;
  onSelect: (projectId: string) => void;
}) {
  const { language, t } = useI18n();
  const selectedProject = projects.find((project) => project.id === selectedId);
  const revisionOptions = Array.from(
    new Set([
      "HEAD",
      "HEAD~1",
      ...(selectedProject?.repo?.references ?? []).map(
        (reference) => reference.name,
      ),
      ...(selectedProject?.repo?.recentCommits ?? []).map(
        (commit) => commit.sha,
      ),
    ]),
  );
  const [fromRevision, setFromRevision] = useState(
    selectedProject?.repo?.recentCommits[1]?.sha ?? "HEAD~1",
  );
  const [toRevision, setToRevision] = useState("HEAD");
  const [changeSummary, setChangeSummary] = useState<GitChangeSummary | null>(
    null,
  );
  const [isLoadingChanges, setIsLoadingChanges] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const commits = projects
    .flatMap((project) =>
      (project.repo?.recentCommits ?? []).map((commit) => ({
        project,
        commit,
      })),
    )
    .sort((left, right) => right.commit.timestamp - left.commit.timestamp);

  return (
    <div className="git-history-view">
      <section className="git-change-panel">
        <div className="section-heading">
          <h3>{t("versionChanges")}</h3>
          <span>{selectedProject?.name ?? t("selectProject")}</span>
        </div>
        {selectedProject?.repo ? (
          <>
            <div className="git-revision-controls">
              <label>
                <span>{t("fromRevision")}</span>
                <input
                  className="form-control"
                  list="git-revisions-from"
                  value={fromRevision}
                  onChange={(event) => setFromRevision(event.target.value)}
                />
                <datalist id="git-revisions-from">
                  {revisionOptions.map((revision) => (
                    <option value={revision} key={revision} />
                  ))}
                </datalist>
              </label>
              <label>
                <span>{t("toRevision")}</span>
                <input
                  className="form-control"
                  list="git-revisions-to"
                  value={toRevision}
                  onChange={(event) => setToRevision(event.target.value)}
                />
                <datalist id="git-revisions-to">
                  {revisionOptions.map((revision) => (
                    <option value={revision} key={revision} />
                  ))}
                </datalist>
              </label>
              <button
                type="button"
                disabled={isLoadingChanges || !fromRevision.trim()}
                onClick={() => {
                  setIsLoadingChanges(true);
                  setChangeError(null);
                  void bridge
                    .readGitChangeSummary(
                      selectedProject.path,
                      fromRevision.trim(),
                      toRevision.trim() || undefined,
                    )
                    .then(setChangeSummary)
                    .catch((error) =>
                      setChangeError(
                        error instanceof Error ? error.message : String(error),
                      ),
                    )
                    .finally(() => setIsLoadingChanges(false));
                }}
              >
                {isLoadingChanges ? t("loadingChanges") : t("loadChanges")}
              </button>
            </div>
            {changeError ? <p className="inline-error">{changeError}</p> : null}
            {changeSummary ? (
              <div className="git-change-summary">
                <div className="change-totals">
                  <span>
                    {fill(
                      t("changedFiles"),
                      "count",
                      String(changeSummary.files.length),
                    )}
                  </span>
                  <span className="change-additions">
                    +{changeSummary.insertions} {t("insertions")}
                  </span>
                  <span className="change-deletions">
                    −{changeSummary.deletions} {t("deletions")}
                  </span>
                </div>
                {changeSummary.commits.length ? (
                  <CommitList commits={changeSummary.commits} />
                ) : (
                  <p className="empty-copy">{t("noChanges")}</p>
                )}
                {changeSummary.files.length ? (
                  <div className="changed-file-list">
                    {changeSummary.files.map((file) => (
                      <div key={file.path}>
                        <span>
                          <strong>{file.status}</strong> {file.path}
                        </span>
                        <small>
                          {file.additions ?? "—"} / {file.deletions ?? "—"}
                        </small>
                      </div>
                    ))}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard?.writeText(
                      JSON.stringify(changeSummary, null, 2),
                    )
                  }
                >
                  {t("copyChanges")}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <p className="empty-copy">{t("gitHistoryUnavailable")}</p>
        )}
      </section>
      {commits.length ? (
        <div className="git-history-list">
          {commits.map(({ project, commit }) => (
            <button
              type="button"
              className={`git-history-row ${project.id === selectedId ? "is-selected" : ""}`}
              key={`${project.id}:${commit.sha}`}
              onClick={() => onSelect(project.id)}
            >
              <span className="commit-dot" />
              <span className="git-history-project">
                <strong>{project.name}</strong>
                <span>{commit.subject}</span>
              </span>
              <span className="git-history-meta">
                <span>{commit.shortSha}</span>
                <time>{formatTime(commit.timestamp, language)}</time>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span>⌘</span>
          <h3>{t("noCommits")}</h3>
          <p>{t("gitHistoryDescription")}</p>
        </div>
      )}
    </div>
  );
}

function SettingsPanel({
  theme,
  setTheme,
  layout,
  setLayout,
  language,
  setLanguage,
  workspacePaths,
  onWorkspacePathsChange,
  excludeNames,
  setExcludeNames,
  onScan,
  isScanning,
}: {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  layout: LayoutId;
  setLayout: (layout: LayoutId) => void;
  language: Language;
  setLanguage: (language: Language) => void;
  workspacePaths: string[];
  onWorkspacePathsChange: (paths: string[]) => void;
  excludeNames: string[];
  setExcludeNames: (names: string[]) => void;
  onScan: () => void;
  isScanning: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="settings-view">
      <div className="settings-grid">
        <section className="settings-card">
          <h3>{t("appearance")}</h3>
          <p>{t("appearanceDescription")}</p>
          <label className="settings-control" htmlFor="settings-theme">
            <span>{t("theme")}</span>
            <select
              className="form-control"
              id="settings-theme"
              value={theme}
              onChange={(event) => setTheme(event.target.value as ThemeId)}
            >
              <option value="deep-ocean">{t("deepOcean")}</option>
              <option value="mist-silver">{t("mistSilver")}</option>
              <option value="warm-ink">{t("warmInk")}</option>
            </select>
          </label>
          <label className="settings-control" htmlFor="settings-layout">
            <span>{t("layout")}</span>
            <select
              className="form-control"
              id="settings-layout"
              value={layout}
              onChange={(event) => setLayout(event.target.value as LayoutId)}
            >
              <option value="overview">{t("overview")}</option>
              <option value="matrix">{t("platformMatrix")}</option>
            </select>
          </label>
          <label className="settings-control" htmlFor="settings-language">
            <span>{t("language")}</span>
            <select
              className="form-control"
              id="settings-language"
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
            >
              <option value="en">{t("languageEnglish")}</option>
              <option value="zh">{t("languageChinese")}</option>
            </select>
          </label>
        </section>

        <section className="settings-card settings-card-workspace">
          <h3>{t("workspace")}</h3>
          <p>{t("workspaceDescription")}</p>
          <div className="workspace-path-list">
            {workspacePaths.map((path, index) => (
              <div className="workspace-path-row" key={`${index}-${path}`}>
                <input
                  className="form-control"
                  aria-label={`${t("workspacePath")} ${index + 1}`}
                  value={path}
                  onChange={(event) => {
                    const next = [...workspacePaths];
                    next[index] = event.target.value;
                    onWorkspacePathsChange(next);
                  }}
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() =>
                    onWorkspacePathsChange(
                      workspacePaths.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    )
                  }
                >
                  −
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => onWorkspacePathsChange([...workspacePaths, ""])}
          >
            {t("addWorkspace")}
          </button>
          <label className="settings-control">
            <span>{t("excludeDirectories")}</span>
            <textarea
              className="form-control form-control-multiline"
              value={excludeNames.join("\n")}
              onChange={(event) =>
                setExcludeNames(
                  event.target.value
                    .split(/\n|,/)
                    .map((value) => value.trim())
                    .filter(Boolean),
                )
              }
              rows={3}
              placeholder="node_modules, target"
            />
          </label>
          <div className="settings-footer">
            <p className="settings-help">
              {t("workspaceExclusionDescription")}
            </p>
            <button
              className="scan-button settings-scan"
              type="button"
              onClick={onScan}
              disabled={isScanning}
            >
              <span aria-hidden="true">{isScanning ? "◌" : "↻"}</span>
              {isScanning ? t("scanning") : t("scanWorkspace")}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
