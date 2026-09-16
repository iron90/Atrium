import type { CommandKind, Facet, ProjectConfigurationStatus } from "./common";
import type { GitSnapshot } from "./git";
import type { IconConformance, ProjectIcon, ProtocolStatus } from "./protocol";
import type { BuildArtifact, ProjectStorage } from "./storage";

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

export interface WorkspaceSnapshot {
  rootPath: string;
  scannedAt: number;
  projects: ProjectSnapshot[];
  warnings: string[];
}
