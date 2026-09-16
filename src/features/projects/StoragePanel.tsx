import type { ProjectSnapshot, ProjectStorage } from "../../bridge";
import { useI18n } from "../../i18n";
import { fill, formatBytes } from "../../shared/format";
import { storageKindLabel } from "./presentation";

export interface CleanupFeedback {
  removedBytes: number;
  failedCount: number;
}

interface StoragePanelProps {
  project: ProjectSnapshot;
  storage: ProjectStorage;
  cleanupFeedback: CleanupFeedback | null;
  cleanupSelection: string[];
  onCleanupSelectionChange: (paths: string[]) => void;
  isCleaningArtifacts: boolean;
  onCleanArtifacts: (project: ProjectSnapshot) => void;
}

export function StoragePanel({
  project,
  storage,
  cleanupFeedback,
  cleanupSelection,
  onCleanupSelectionChange,
  isCleaningArtifacts,
  onCleanArtifacts,
}: StoragePanelProps) {
  const { t } = useI18n();

  return (
    <div className="storage-panel">
      <div className="storage-summary">
        <div>
          <strong>{formatBytes(storage.totalBytes)}</strong>
          <span>{t("projectStorage")}</span>
        </div>
        <div>
          <strong>{formatBytes(storage.cleanableBytes)}</strong>
          <span>{t("cleanableStorage")}</span>
        </div>
      </div>
      {!storage.isComplete ? (
        <p className="storage-warning" role="status">
          {t("storageScanIncomplete")}
        </p>
      ) : null}

      {storage.entries.length ? (
        <>
          <div className="storage-entry-list">
            {storage.entries.map((entry) => (
              <label
                className={`storage-entry storage-${entry.kind}`}
                key={entry.relativePath}
              >
                <input
                  type="checkbox"
                  checked={cleanupSelection.includes(entry.relativePath)}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...cleanupSelection, entry.relativePath]
                      : cleanupSelection.filter(
                          (path) => path !== entry.relativePath,
                        );
                    onCleanupSelectionChange(next);
                  }}
                />
                <div>
                  <strong>{entry.relativePath}</strong>
                  <span>
                    {storageKindLabel(entry, t)} ·{" "}
                    {fill(t("storageFiles"), "count", String(entry.fileCount))}
                    {!entry.isComplete
                      ? ` · ${t("storageEntryIncomplete")}`
                      : ""}
                  </span>
                </div>
                <em>{formatBytes(entry.bytes)}</em>
              </label>
            ))}
          </div>
          <button
            className="cleanup-button"
            type="button"
            onClick={() => onCleanArtifacts(project)}
            disabled={isCleaningArtifacts || !cleanupSelection.length}
          >
            {isCleaningArtifacts ? t("cleaningArtifacts") : t("cleanSelected")}
          </button>
          {cleanupFeedback ? (
            <p
              className={`cleanup-message ${
                cleanupFeedback.failedCount ? "is-warning" : ""
              }`}
            >
              {cleanupFeedback.failedCount
                ? fill(
                    t("cleanupCompletedWithFailures"),
                    "size",
                    formatBytes(cleanupFeedback.removedBytes),
                  ).replace("{count}", String(cleanupFeedback.failedCount))
                : fill(
                    t("cleanupCompleted"),
                    "size",
                    formatBytes(cleanupFeedback.removedBytes),
                  )}
            </p>
          ) : null}
        </>
      ) : (
        <p className="empty-copy">{t("noCleanableArtifacts")}</p>
      )}
    </div>
  );
}
