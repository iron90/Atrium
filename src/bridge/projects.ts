import { invoke } from "@tauri-apps/api/core";
import { demoSnapshot } from "./fake-bridge";
import type {
  CleanupResult,
  ProjectGuidanceReport,
  ProjectSnapshot,
  WorkspaceSnapshot,
} from "./types";

export const nativeProjectMethods = {
  pickWorkspaceDirectory: async (): Promise<string | null> => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const result = await open({
      directory: true,
      multiple: false,
      canCreateDirectories: true,
    });
    return typeof result === "string" ? result : null;
  },

  scanWorkspace: async (
    rootPath: string,
    excludedNames: string[] = [],
  ): Promise<WorkspaceSnapshot> =>
    invoke<WorkspaceSnapshot>("scan_workspace_command", {
      rootPath,
      excludedNames,
    }),

  syncWorkspaceRoots: async (rootPaths: string[]): Promise<void> => {
    await invoke("sync_workspace_roots_command", { rootPaths });
  },

  inspectProject: async (projectPath: string): Promise<ProjectSnapshot> =>
    invoke<ProjectSnapshot>("inspect_project_command", { projectPath }),

  cleanProjectArtifacts: async (
    projectPath: string,
    selectedPaths: string[] = [],
  ): Promise<CleanupResult> =>
    invoke<CleanupResult>("clean_project_artifacts_command", {
      projectPath,
      selectedPaths,
    }),

  generateProjectGuidance: async (
    projectPath: string,
  ): Promise<ProjectGuidanceReport> =>
    invoke<ProjectGuidanceReport>("generate_project_guidance_command", {
      projectPath,
    }),
};

export const previewProjectMethods = {
  pickWorkspaceDirectory: async (): Promise<string | null> => null,

  syncWorkspaceRoots: async (): Promise<void> => undefined,

  scanWorkspace: async (rootPath: string): Promise<WorkspaceSnapshot> => {
    await new Promise((resolve) => window.setTimeout(resolve, 280));
    return demoSnapshot(rootPath);
  },

  inspectProject: async (projectPath: string): Promise<ProjectSnapshot> => {
    await new Promise((resolve) => window.setTimeout(resolve, 260));
    const rootPath = projectPath.slice(0, projectPath.lastIndexOf("/"));
    const project = demoSnapshot(rootPath).projects.find(
      (candidate) => candidate.path === projectPath,
    );
    if (!project) throw new Error("Project details are unavailable");
    return project;
  },

  cleanProjectArtifacts: async (): Promise<CleanupResult> => ({
    removedBytes: 0,
    removedEntries: [],
    failedEntries: [],
    storage: {
      totalBytes: 0,
      cleanableBytes: 0,
      isComplete: true,
      entries: [],
    },
  }),

  generateProjectGuidance: async (): Promise<ProjectGuidanceReport> => ({
    paths: [
      ".atrium/reports/project-configuration.md",
      ".atrium/guidance.toml",
    ],
    configurationStatus: "missing",
    guidanceRevision: 2,
  }),
};
