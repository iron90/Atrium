import type {
  BuildArtifact,
  BuildProfile,
  ProfileAction,
  ProjectCommand,
  ProjectSnapshot,
  StorageEntry,
} from "../../bridge";
import { translate, type Language, type TranslationKey } from "../../i18n";
import { fill } from "../../shared/format";

export const storageKindLabel = (
  entry: StorageEntry,
  t: (key: TranslationKey) => string,
): string => (entry.kind === "cache" ? t("cache") : t("buildArtifacts"));

export const artifactKindLabel = (
  artifact: BuildArtifact,
  t: (key: TranslationKey) => string,
): string => {
  switch (artifact.kind) {
    case "file":
      return t("artifactFile");
    case "directory":
      return t("artifactDirectory");
    case "missing":
      return t("artifactMissing");
    case "invalid":
      return t("artifactInvalid");
  }
};

export const statusLabel = (
  project: ProjectSnapshot,
  language: Language,
): string => {
  if (!project.repo) return translate(language, "gitNotFound");
  if (project.repo.isClean) return translate(language, "clean");
  return fill(
    translate(language, "uncommittedChanges"),
    "count",
    String(project.repo.worktreeChanges),
  );
};

export const statusClass = (project: ProjectSnapshot): string => {
  if (!project.repo) return "status-muted";
  return project.repo.isClean ? "status-good" : "status-warning";
};

export const syncStatusVisual = (
  repo: NonNullable<ProjectSnapshot["repo"]>,
): string => `↑ ${repo.ahead ?? "—"} · ↓ ${repo.behind ?? "—"}`;

export const syncStatusAriaLabel = (
  repo: NonNullable<ProjectSnapshot["repo"]>,
  language: Language,
): string => {
  if (repo.ahead === null || repo.behind === null) {
    return translate(language, "upstreamMissing");
  }
  return [
    fill(translate(language, "aheadCommits"), "count", String(repo.ahead)),
    fill(translate(language, "behindCommits"), "count", String(repo.behind)),
  ].join(" · ");
};

export const syncStatusClass = (
  repo: NonNullable<ProjectSnapshot["repo"]>,
): string => {
  if (repo.ahead === null || repo.behind === null) return "status-muted";
  return repo.ahead > 0 || repo.behind > 0 ? "status-warning" : "status-good";
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

export const commandLabel = (
  command: ProjectCommand,
  language: Language,
): string => {
  if (command.kind === "run") return translate(language, "run");
  if (command.kind === "check") return translate(language, "check");
  if (command.kind === "build") return translate(language, "build");
  return command.label;
};

export const profileCommandId = (
  profile: BuildProfile,
  action: ProfileAction,
): string | null => {
  if (action === "run") return profile.runCommandId;
  if (action === "check") return profile.checkCommandId;
  return profile.buildCommandId;
};

export const commandForProfile = (
  profile: BuildProfile,
  action: ProfileAction,
  commands: ProjectCommand[],
): ProjectCommand | undefined => {
  const commandId = profileCommandId(profile, action);
  return commandId
    ? commands.find((command) => command.id === commandId)
    : undefined;
};

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
