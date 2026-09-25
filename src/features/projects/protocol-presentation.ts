import type { ProjectSnapshot } from "../../bridge";
import type { TranslationKey } from "../../i18n";

export type ProtocolCardStatus = "configured" | "needs-update" | "missing";

export interface ProtocolViewModel {
  isReady: boolean;
  cardStatus: ProtocolCardStatus;
  needsUpdate: boolean;
  hasPendingHostVerification: boolean;
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
  const protocolIsConnected =
    project.protocol.manifestStatus === "configured" &&
    project.protocol.capabilities.length > 0 &&
    project.protocol.capabilities.every(
      (capability) => capability.status === "configured",
    );
  const hasConfigurationGap =
    project.configuration.status !== "configured" ||
    project.buildProfiles.length === 0;
  const guidanceNeedsUpdate = project.guidance.needsUpdate;
  const hasPendingHostVerification = project.buildProfiles.some(
    (profile) => profile.unverifiedActions.length > 0,
  );
  const needsUpdate =
    project.protocol.needsUpdate ||
    (protocolIsConnected && guidanceNeedsUpdate);
  const cardStatus: ProtocolCardStatus = needsUpdate
    ? "needs-update"
    : !protocolIsConnected
      ? "missing"
      : "configured";
  return {
    isReady,
    cardStatus,
    needsUpdate,
    hasPendingHostVerification,
    shouldShowGuidance:
      !protocolIsConnected ||
      hasConfigurationGap ||
      needsUpdate ||
      hasPendingHostVerification,
  };
};

const hasConfiguredCapability = (
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
    case "needs-update":
      return t("protocolStatusNeedsUpdate");
    case "missing":
      return t("protocolStatusMissing");
  }
};
