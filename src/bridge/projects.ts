import { invoke } from "@tauri-apps/api/core";
import { demoSnapshot } from "./fake-bridge";
import { isTauriRuntime } from "./runtime";
import type {
  CleanupResult,
  IconConformanceReport,
  ProjectConfigurationReport,
  ProjectGuidanceReport,
  ProjectSnapshot,
  WorkspaceSnapshot,
} from "./types";

export const defaultWorkspacePath = async (): Promise<string> => {
  if (!isTauriRuntime()) {
    return "~/projects";
  }
  return invoke<string>("default_workspace_path_command");
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
        entries: [],
      },
    };
  }
  return invoke<CleanupResult>("clean_project_artifacts_command", {
    projectPath,
    selectedPaths,
  });
};

export const generateIconConformanceReport = async (
  projectPath: string,
): Promise<IconConformanceReport> => {
  if (!isTauriRuntime()) {
    return { path: ".atrium/reports/icon-conformance.md", status: "legacy" };
  }
  return invoke<IconConformanceReport>(
    "generate_icon_conformance_report_command",
    { projectPath },
  );
};

export const generateProjectConfigurationReport = async (
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
};

export const generateProjectGuidance = async (
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
};
