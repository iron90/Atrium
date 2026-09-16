export type FacetSource = "detected" | "configured";
export type CommandKind = "run" | "check" | "build" | "other";
export type ProfileAction = Exclude<CommandKind, "other">;
export type ProjectConfigurationStatus = "configured" | "missing" | "invalid";
export type RunStatus = "running" | "succeeded" | "failed" | "cancelled";
export type OutputStream = "stdout" | "stderr";
export type IconConformanceStatus =
  "compliant" | "legacy" | "missing" | "invalid";
export type ProtocolCapabilityStatus =
  "configured" | "partial" | "missing" | "invalid" | "legacy";
export type StorageEntryKind = "cache" | "build";

export interface Facet {
  key: string;
  label: string;
  source: FacetSource;
  evidence: string[];
}

export interface GitCommit {
  sha: string;
  shortSha: string;
  author: string;
  timestamp: number;
  subject: string;
}

export interface GitSnapshot {
  branch: string | null;
  isClean: boolean;
  worktreeChanges: number;
  remote: string | null;
  ahead: number | null;
  behind: number | null;
  lastCommit: GitCommit | null;
  recentCommits: GitCommit[];
  references: GitReference[];
}

export type GitReferenceKind = "branch" | "tag";

export interface GitReference {
  name: string;
  kind: GitReferenceKind;
  sha: string | null;
}

export interface GitChangeSummary {
  projectPath: string;
  from: string;
  to: string;
  commits: GitCommit[];
  files: GitFileChange[];
  insertions: number;
  deletions: number;
}

export interface GitFileChange {
  path: string;
  status: string;
  additions: number | null;
  deletions: number | null;
}

export interface ProjectTools {
  terminal: string | null;
}

export interface ProjectLink {
  id: string;
  label: string;
  url: string;
  kind: string | null;
}

export interface ProjectCommand {
  id: string;
  kind: CommandKind;
  label: string;
  program: string;
  args: string[];
  workingDirectory: string;
  displayCommand: string;
  source: string;
}

export interface CleanupDeclaration {
  cache: string[];
  build: string[];
}

export interface StorageEntry {
  relativePath: string;
  kind: StorageEntryKind;
  bytes: number;
  fileCount: number;
}

export type BuildArtifactKind = "file" | "directory" | "missing" | "invalid";

export interface BuildArtifact {
  profileId: string;
  profileLabel: string;
  relativePath: string;
  kind: BuildArtifactKind;
  bytes: number;
  fileCount: number;
  modifiedAt: number | null;
}

export interface ProjectStorage {
  totalBytes: number;
  cleanableBytes: number;
  entries: StorageEntry[];
}

export interface StorageCleanupFailure {
  relativePath: string;
  message: string;
}

export interface CleanupResult {
  removedBytes: number;
  removedEntries: StorageEntry[];
  failedEntries: StorageCleanupFailure[];
  storage: ProjectStorage;
}

export interface BuildProfile {
  id: string;
  label: string;
  platform: Facet;
  channel: Facet;
  runCommandId: string | null;
  checkCommandId: string | null;
  buildCommandId: string | null;
  source: string;
  region: string | null;
  payment: string | null;
  artifacts: string[];
  issues: string[];
}

export interface ProjectConfiguration {
  status: ProjectConfigurationStatus;
  manifestPath: string;
  issues: string[];
}

export interface ProtocolCapability {
  id: string;
  status: ProtocolCapabilityStatus;
  evidence: string[];
  issues: string[];
}

export interface ProtocolStatus {
  manifestPath: string;
  schema: number | null;
  manifestStatus: ProjectConfigurationStatus;
  capabilities: ProtocolCapability[];
}

export interface ProjectSnapshot {
  id: string;
  name: string;
  path: string;
  description: string | null;
  icon: ProjectIcon | null;
  iconConformance: IconConformance;
  protocol: ProtocolStatus;
  repo: GitSnapshot | null;
  tools: ProjectTools;
  links: ProjectLink[];
  platforms: Facet[];
  channels: Facet[];
  buildProfiles: BuildProfile[];
  configuration: ProjectConfiguration;
  commands: ProjectCommand[];
  cleanup: CleanupDeclaration;
  storage: ProjectStorage | null;
  artifacts: BuildArtifact[] | null;
  scannedAt: number;
}

export interface IconConformance {
  status: IconConformanceStatus;
  manifestPath: string;
  reportPath: string;
  declaredIcon: string | null;
  resolvedIcon: string | null;
}

export interface IconConformanceReport {
  path: string;
  status: IconConformanceStatus;
}

export interface ProjectConfigurationReport {
  path: string;
  status: ProjectConfigurationStatus;
}

export interface ProjectGuidanceReport {
  paths: string[];
  configurationStatus: ProjectConfigurationStatus;
  iconStatus: IconConformanceStatus;
}

export interface ProjectIcon {
  dataUrl: string;
  source: string;
}

export interface WorkspaceSnapshot {
  rootPath: string;
  scannedAt: number;
  projects: ProjectSnapshot[];
  warnings: string[];
}

export interface RunStarted {
  runId: string;
  projectId: string;
  commandId: string;
  profileId: string | null;
  displayCommand: string;
  startedAt: number;
  status: "running";
}

export interface RunOutput {
  runId: string;
  stream: OutputStream;
  line: string;
}

export interface RunError {
  runId: string;
  message: string;
}

export interface RunFinished {
  runId: string;
  projectId: string;
  commandId: string;
  profileId: string | null;
  profileAction: CommandKind | null;
  projectPath: string;
  platform: Facet | null;
  channel: Facet | null;
  gitBranch: string | null;
  gitCommit: string | null;
  worktreeClean: boolean | null;
  displayCommand: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  status: Exclude<RunStatus, "running">;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}
