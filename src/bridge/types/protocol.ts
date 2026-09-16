import type { ProjectConfigurationStatus } from "./common";

export type IconConformanceStatus =
  "compliant" | "legacy" | "missing" | "invalid";
export type ProtocolCapabilityStatus =
  "configured" | "partial" | "missing" | "invalid" | "legacy";

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
