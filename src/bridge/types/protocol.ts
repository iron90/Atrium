import type { ProjectConfigurationStatus } from "./common";

export type IconConformanceStatus =
  "compliant" | "legacy" | "missing" | "invalid";
export type ProtocolCapabilityStatus =
  "configured" | "partial" | "missing" | "invalid" | "legacy";

export interface IconConformance {
  status: IconConformanceStatus;
  manifestPath: string;
  declaredIcon: string | null;
  resolvedIcon: string | null;
}

export interface ProjectGuidanceReport {
  paths: string[];
  configurationStatus: ProjectConfigurationStatus;
  guidanceRevision: number;
}

export interface ProjectIcon {
  dataUrl: string;
  source: string;
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
  needsUpdate: boolean;
  manifestStatus: ProjectConfigurationStatus;
  capabilities: ProtocolCapability[];
}

export interface GuidanceStatus {
  revision: number | null;
  needsUpdate: boolean;
  needsSync: boolean;
}
