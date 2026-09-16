import { invoke } from "@tauri-apps/api/core";
import { demoSnapshot, fakeRun } from "./fake-bridge";
import type {
  CleanupResult,
  GitChangeSummary,
  IconConformanceReport,
  ProjectConfigurationReport,
  ProjectGuidanceReport,
  ProjectSnapshot,
  RunFinished,
  RunStarted,
  WorkspaceSnapshot,
} from "./types";

export const isTauriRuntime = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const bridge = {
  defaultWorkspacePath: async (): Promise<string> => {
    if (!isTauriRuntime()) {
      return "~/projects";
    }
    return invoke<string>("default_workspace_path_command");
  },
  scanWorkspace: async (
    rootPath: string,
    excludedNames: string[] = [],
  ): Promise<WorkspaceSnapshot> => {
    if (!isTauriRuntime()) {
      await new Promise((resolve) => window.setTimeout(resolve, 280));
      return demoSnapshot(rootPath);
    }
    return invoke<WorkspaceSnapshot>("scan_workspace_command", {
      rootPath,
      excludedNames,
    });
  },
  inspectProject: async (projectPath: string): Promise<ProjectSnapshot> => {
    if (!isTauriRuntime()) {
      await new Promise((resolve) => window.setTimeout(resolve, 260));
      const rootPath = projectPath.slice(0, projectPath.lastIndexOf("/"));
      const project = demoSnapshot(rootPath).projects.find(
        (candidate) => candidate.path === projectPath,
      );
      if (!project) throw new Error("Project details are unavailable");
      return project;
    }
    return invoke<ProjectSnapshot>("inspect_project_command", { projectPath });
  },
  cleanProjectArtifacts: async (
    projectPath: string,
    selectedPaths: string[] = [],
  ): Promise<CleanupResult> => {
    if (!isTauriRuntime()) {
      return {
        removedBytes: 0,
        removedEntries: [],
        failedEntries: [],
        storage: {
          totalBytes: 0,
          cleanableBytes: 0,
          entries: [],
        },
      };
    }
    return invoke<CleanupResult>("clean_project_artifacts_command", {
      projectPath,
      selectedPaths,
    });
  },
  generateIconConformanceReport: async (
    projectPath: string,
  ): Promise<IconConformanceReport> => {
    if (!isTauriRuntime()) {
      return { path: ".atrium/reports/icon-conformance.md", status: "legacy" };
    }
    return invoke<IconConformanceReport>(
      "generate_icon_conformance_report_command",
      { projectPath },
    );
  },
  generateProjectConfigurationReport: async (
    projectPath: string,
  ): Promise<ProjectConfigurationReport> => {
    if (!isTauriRuntime()) {
      return {
        path: ".atrium/reports/project-configuration.md",
        status: "missing",
      };
    }
    return invoke<ProjectConfigurationReport>(
      "generate_project_configuration_report_command",
      { projectPath },
    );
  },
  generateProjectGuidance: async (
    projectPath: string,
  ): Promise<ProjectGuidanceReport> => {
    if (!isTauriRuntime()) {
      return {
        paths: [
          ".atrium/reports/project-configuration.md",
          ".atrium/reports/icon-conformance.md",
        ],
        configurationStatus: "missing",
        iconStatus: "missing",
      };
    }
    return invoke<ProjectGuidanceReport>("generate_project_guidance_command", {
      projectPath,
    });
  },
  runProjectCommand: async (
    projectPath: string,
    commandId: string,
    profileId?: string,
    profileAction?: "run" | "check" | "build",
  ): Promise<RunStarted> => {
    if (!isTauriRuntime()) {
      return fakeRun(projectPath, commandId, profileId);
    }
    return invoke<RunStarted>("run_project_command", {
      projectPath,
      commandId,
      profileId,
      profileAction,
    });
  },
  listRunHistory: async (): Promise<RunFinished[]> => {
    if (!isTauriRuntime()) {
      return [];
    }
    return invoke<RunFinished[]>("list_run_history_command");
  },
  openRunLog: async (runId: string): Promise<void> => {
    if (!isTauriRuntime()) {
      return;
    }
    return invoke<void>("open_run_log_command", { runId });
  },
  openArtifact: async (
    projectPath: string,
    profileId: string,
    relativePath: string,
  ): Promise<void> => {
    if (!isTauriRuntime()) {
      return;
    }
    return invoke<void>("open_declared_artifact_command", {
      projectPath,
      profileId,
      relativePath,
    });
  },
  stopProjectCommand: async (runId: string): Promise<void> => {
    if (!isTauriRuntime()) {
      return;
    }
    return invoke<void>("stop_project_command", { runId });
  },
  readGitChangeSummary: async (
    projectPath: string,
    from: string,
    to?: string,
  ): Promise<GitChangeSummary> => {
    if (!isTauriRuntime()) {
      const project = demoSnapshot(
        projectPath.slice(0, projectPath.lastIndexOf("/")),
      ).projects.find((candidate) => candidate.path === projectPath);
      const commits = project?.repo?.recentCommits ?? [];
      return {
        projectPath,
        from,
        to: to ?? "HEAD",
        commits,
        files: commits.map((commit) => ({
          path: `src/${commit.shortSha}.ts`,
          status: "M",
          additions: 12,
          deletions: 4,
        })),
        insertions: commits.length * 12,
        deletions: commits.length * 4,
      };
    }
    return invoke<GitChangeSummary>("read_git_change_summary_command", {
      projectPath,
      from,
      to,
    });
  },
  openProjectDirectory: async (projectPath: string): Promise<void> => {
    if (!isTauriRuntime()) return;
    return invoke<void>("open_project_directory_command", { projectPath });
  },
  openProjectTerminal: async (
    projectPath: string,
    terminal?: string | null,
  ): Promise<void> => {
    if (!isTauriRuntime()) return;
    return invoke<void>("open_project_terminal_command", {
      projectPath,
      terminal,
    });
  },
  openProjectRemote: async (remote: string): Promise<void> => {
    if (!isTauriRuntime()) return;
    return invoke<void>("open_project_remote_command", { remote });
  },
  openProjectLink: async (
    projectPath: string,
    linkId: string,
  ): Promise<void> => {
    if (!isTauriRuntime()) return;
    return invoke<void>("open_project_link_command", { projectPath, linkId });
  },
};

export type * from "./types";
