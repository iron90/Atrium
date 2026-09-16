import type { ProjectSnapshot } from "../../bridge";
import type { TranslationKey } from "../../i18n";

export type ProtocolCardStatus =
  "configured" | "partial" | "missing" | "invalid";

export interface ProtocolViewModel {
  isReady: boolean;
  cardStatus: ProtocolCardStatus;
  shouldShowGuidance: boolean;
}

export const protocolViewModel = (
  project: ProjectSnapshot,
): ProtocolViewModel => {
  const coreCapabilities = project.protocol.capabilities.filter(
    (capability) => capability.id !== "cleanup",
  );
  const isReady =
    project.protocol.manifestStatus === "configured" &&
    coreCapabilities.length > 0 &&
    coreCapabilities.every((capability) => capability.status === "configured");
  const cardStatus: ProtocolCardStatus =
    project.protocol.manifestStatus !== "configured"
      ? project.protocol.manifestStatus
      : project.protocol.capabilities.some(
            (capability) => capability.status !== "configured",
          )
        ? "partial"
        : "configured";
  const hasConfigurationGap =
    project.configuration.status !== "configured" ||
    project.buildProfiles.length === 0;
  const cleanupCapability = project.protocol.capabilities.find(
    (capability) => capability.id === "cleanup",
  );

  return {
    isReady,
    cardStatus,
    shouldShowGuidance:
      !isReady ||
      hasConfigurationGap ||
      cleanupCapability?.status === "invalid",
  };
};

export const hasConfiguredCapability = (
  project: ProjectSnapshot,
  capabilityId: string,
): boolean =>
  project.protocol.manifestStatus === "configured" &&
  project.protocol.capabilities.some(
    (capability) =>
      capability.id === capabilityId && capability.status === "configured",
  );

export const hasTrustedContext = (project: ProjectSnapshot): boolean =>
  hasConfiguredCapability(project, "identity") &&
  hasConfiguredCapability(project, "context");

export const capabilityLabel = (
  id: string,
  t: (key: TranslationKey) => string,
): string => {
  switch (id) {
    case "identity":
      return t("capabilityIdentity");
    case "context":
      return t("capabilityContext");
    case "build_profiles":
      return t("capabilityBuildProfiles");
    case "cleanup":
      return t("capabilityCleanup");
    default:
      return id;
  }
};

export const capabilityStatusLabel = (
  status: ProjectSnapshot["protocol"]["capabilities"][number]["status"],
  t: (key: TranslationKey) => string,
): string => {
  switch (status) {
    case "configured":
      return t("capabilityConfigured");
    case "partial":
      return t("capabilityPartial");
    case "missing":
      return t("capabilityMissing");
    case "invalid":
      return t("capabilityInvalid");
    case "legacy":
      return t("capabilityLegacy");
  }
};

export const protocolManifestLabel = (
  status: ProjectSnapshot["protocol"]["manifestStatus"],
  t: (key: TranslationKey) => string,
): string => {
  switch (status) {
    case "configured":
      return t("protocolManifestConfigured");
    case "missing":
      return t("protocolManifestMissing");
    case "invalid":
      return t("protocolManifestInvalid");
  }
};
