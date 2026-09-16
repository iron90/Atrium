import type { BuildArtifact, StorageEntry } from "../../bridge";
import type { TranslationKey } from "../../i18n";

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
