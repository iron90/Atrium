import type { ProjectSnapshot } from "../../bridge";
import type { TranslationKey } from "../../i18n";

export type ProtocolCardStatus =
  | "configured"
  | "needs-sync"
  | "needs-update"
  | "missing";

export interface ProtocolViewModel {
  isReady: boolean;
  cardStatus: ProtocolCardStatus;
  needsUpdate: boolean;
  needsSync: boolean;
  needsGuidance: boolean;
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
  const needsUpdate =
    project.protocol.needsUpdate ||
    (protocolIsConnected && project.guidance.needsUpdate);
  // The development Agent acknowledges synchronized guidance through
  // guidance-sync.toml. A missing acknowledgement means the integration is
  // unfinished even when the generated guidance itself is current; command
  // verification states never belong on this card.
  const needsSync =
    protocolIsConnected && !needsUpdate && project.guidance.needsSync;
  const cardStatus: ProtocolCardStatus = needsUpdate
    ? "needs-update"
    : needsSync
      ? "needs-sync"
      : !protocolIsConnected
        ? "missing"
        : "configured";
  return {
    isReady,
    cardStatus,
    needsUpdate,
    needsSync,
    needsGuidance: cardStatus !== "configured",
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
    case "needs-sync":
      return t("protocolStatusNeedsSync");
    case "needs-update":
      return t("protocolStatusNeedsUpdate");
    case "missing":
      return t("protocolStatusMissing");
  }
};
