import type {
  AppUpdateInfo,
  CleanupResult,
  GitBranchOverview,
  GitChangeSummary,
  ProfileAction,
  ProjectGuidanceReport,
  ProjectSnapshot,
  RunFinished,
  RunStarted,
  WorkspaceSnapshot,
} from "./types";

export interface AtriumBridge {
  pickWorkspaceDirectory(): Promise<string | null>;
  scanWorkspace(
    rootPath: string,
    excludedNames?: string[],
  ): Promise<WorkspaceSnapshot>;
  syncWorkspaceRoots(rootPaths: string[]): Promise<void>;
  inspectProject(projectPath: string): Promise<ProjectSnapshot>;
  cleanProjectArtifacts(
    projectPath: string,
    selectedPaths?: string[],
  ): Promise<CleanupResult>;
  generateProjectGuidance(projectPath: string): Promise<ProjectGuidanceReport>;
  runProjectCommand(
    projectPath: string,
    commandId: string,
    profileId?: string,
    profileAction?: ProfileAction,
  ): Promise<RunStarted>;
  listRunHistory(): Promise<RunFinished[]>;
  openRunLog(runId: string): Promise<void>;
  stopProjectCommand(runId: string): Promise<void>;
  readGitChangeSummary(
    projectPath: string,
    from: string,
    to?: string,
  ): Promise<GitChangeSummary>;
  readGitBranchOverview(
    projectPath: string,
    branch: string,
  ): Promise<GitBranchOverview>;
  openArtifact(
    projectPath: string,
    profileId: string,
    relativePath: string,
  ): Promise<void>;
  openProjectDirectory(projectPath: string): Promise<void>;
  openProjectTerminal(projectPath: string): Promise<void>;
  openProjectRemote(remote: string): Promise<void>;
  openWebProfile(projectPath: string, profileId: string): Promise<void>;
  getAppVersion(): Promise<string>;
  checkForAppUpdate(): Promise<AppUpdateInfo | null>;
  downloadAndInstallAppUpdate(
    onProgress?: (percent: number) => void,
  ): Promise<void>;
  relaunchApp(): Promise<void>;
  openAppReleasePage(url: string): Promise<void>;
}
