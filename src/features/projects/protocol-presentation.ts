import type { ProjectSnapshot } from "../../bridge";
import type { TranslationKey } from "../../i18n";

export type ProtocolCardStatus =
  "configured" | "partial" | "missing" | "legacy" | "invalid";

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
  const hasLegacyIcon = project.protocol.capabilities.some(
    (capability) =>
      capability.id === "identity" && capability.status === "legacy",
  );
  const cardStatus: ProtocolCardStatus =
    project.protocol.manifestStatus === "missing" && hasLegacyIcon
      ? "legacy"
      : project.protocol.manifestStatus !== "configured"
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

export const protocolStatusLabel = (
  status: ProtocolCardStatus,
  t: (key: TranslationKey) => string,
): string => {
  switch (status) {
    case "configured":
      return t("protocolStatusConfigured");
    case "partial":
      return t("protocolStatusPartial");
    case "missing":
      return t("protocolStatusMissing");
    case "legacy":
      return t("protocolStatusLegacy");
    case "invalid":
      return t("protocolStatusInvalid");
  }
};

export const protocolStatusDescription = (
  status: ProtocolCardStatus,
  t: (key: TranslationKey) => string,
): string => {
  switch (status) {
    case "configured":
      return t("protocolStatusDescriptionConfigured");
    case "partial":
      return t("protocolStatusDescriptionPartial");
    case "missing":
      return t("protocolStatusDescriptionMissing");
    case "legacy":
      return t("protocolStatusDescriptionLegacy");
    case "invalid":
      return t("protocolStatusDescriptionInvalid");
  }
};
