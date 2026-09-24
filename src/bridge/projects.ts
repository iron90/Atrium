import { invoke } from "@tauri-apps/api/core";
import { demoSnapshot } from "./fake-bridge";
import { isTauriRuntime } from "./runtime";
import type {
  CleanupResult,
  ProjectGuidanceReport,
  ProjectSnapshot,
  WorkspaceSnapshot,
} from "./types";

export const pickWorkspaceDirectory = async (): Promise<string | null> => {
  if (!isTauriRuntime()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const result = await open({
    directory: true,
    multiple: false,
    canCreateDirectories: true,
  });
  return typeof result === "string" ? result : null;
};

export const scanWorkspace = async (
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
};

export const inspectProject = async (
  projectPath: string,
): Promise<ProjectSnapshot> => {
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
};

export const cleanProjectArtifacts = async (
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
        isComplete: true,
        entries: [],
      },
    };
  }
  return invoke<CleanupResult>("clean_project_artifacts_command", {
    projectPath,
    selectedPaths,
  });
};

export const generateProjectGuidance = async (
  projectPath: string,
): Promise<ProjectGuidanceReport> => {
  if (!isTauriRuntime()) {
    return {
      paths: [
        ".atrium/reports/project-configuration.md",
        ".atrium/guidance.toml",
      ],
      configurationStatus: "missing",
      guidanceRevision: 2,
    };
  }
  return invoke<ProjectGuidanceReport>("generate_project_guidance_command", {
    projectPath,
  });
};
