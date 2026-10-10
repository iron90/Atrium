import type {
  CommandKind,
  Facet,
  ProfileAction,
  ProjectConfigurationStatus,
} from "./common";
import type { GitSnapshot } from "./git";
import type {
  GuidanceStatus,
  IconConformance,
  ProjectIcon,
  ProtocolStatus,
} from "./protocol";
import type { BuildArtifact, ProjectStorage } from "./storage";

export interface ProjectTools {
  terminal: string | null;
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

export type HostOs = "macos" | "windows" | "linux";

export interface BuildHostRequirements {
  check: HostOs[] | null;
  build: HostOs[] | null;
  run: HostOs[] | null;
}

export interface ProfileVerificationBlocker {
  action: ProfileAction;
  host: HostOs;
  reason: string;
}

export interface ProfileBlockedAction {
  action: ProfileAction;
  reason: string;
}

export interface BuildProfile {
  id: string;
  label: string;
  platform: Facet;
  channel: Facet;
  checkCommandId: string | null;
  buildCommandId: string | null;
  runCommandId: string | null;
  serviceUrl: string | null;
  hostRequirements: BuildHostRequirements;
  verification: BuildHostRequirements;
  hostMismatchActions: ProfileAction[];
  unverifiedActions: ProfileAction[];
  verificationBlockers: ProfileVerificationBlocker[];
  blockedActions: ProfileBlockedAction[];
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

export interface ProjectSnapshot {
  id: string;
  name: string;
  path: string;
  modifiedAt: number | null;
  description: string | null;
  icon: ProjectIcon | null;
  iconConformance: IconConformance;
  protocol: ProtocolStatus;
  guidance: GuidanceStatus;
  repo: GitSnapshot | null;
  tools: ProjectTools;
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

export interface WorkspaceSnapshot {
  rootPath: string;
  scannedAt: number;
  projects: ProjectSnapshot[];
  warnings: string[];
}
