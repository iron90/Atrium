import type {
  CleanupProgress,
  ProjectSnapshot,
  ProjectStorage,
} from "../../bridge";
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
  cleanupConfirmation: string[] | null;
  cleanupProgress: CleanupProgress | null;
  onCleanupSelectionChange: (paths: string[]) => void;
  isCleaningArtifacts: boolean;
  onCleanArtifacts: (project: ProjectSnapshot) => void;
  onCancelCleanup: () => void;
  onConfirmCleanup: () => void;
}

export function StoragePanel({
  project,
  storage,
  cleanupFeedback,
  cleanupSelection,
  cleanupConfirmation,
  cleanupProgress,
  onCleanupSelectionChange,
  isCleaningArtifacts,
  onCleanArtifacts,
  onCancelCleanup,
  onConfirmCleanup,
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
            {isCleaningArtifacts ? (
              <span className="cleanup-button-progress-label">
                <span>{t("cleaningArtifacts")}</span>
                <strong>{cleanupProgress?.percent ?? 0}%</strong>
              </span>
            ) : (
              t("cleanSelected")
            )}
          </button>
          {isCleaningArtifacts ? (
            <div className="cleanup-progress" role="status" aria-live="polite">
              <div className="cleanup-progress-heading">
                <span>
                  {cleanupProgress?.phase === "finalizing"
                    ? t("finalizingCleanup")
                    : cleanupProgress?.relativePath || t("preparingCleanup")}
                </span>
                <strong>{cleanupProgress?.percent ?? 0}%</strong>
              </div>
              <div
                className="cleanup-progress-track"
                role="progressbar"
                aria-label={t("cleaningArtifacts")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={cleanupProgress?.percent ?? 0}
              >
                <span
                  className="cleanup-progress-value"
                  style={{ width: `${cleanupProgress?.percent ?? 0}%` }}
                />
              </div>
              {cleanupProgress ? (
                <div className="cleanup-progress-meta">
                  <span>
                    {formatBytes(cleanupProgress.completedBytes)} /{" "}
                    {formatBytes(cleanupProgress.totalBytes)}
                  </span>
                  {cleanupProgress.totalFiles ? (
                    <span>
                      {fill(
                        fill(
                          t("cleanupProgressFiles"),
                          "completed",
                          String(cleanupProgress.completedFiles),
                        ),
                        "total",
                        String(cleanupProgress.totalFiles),
                      )}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {cleanupConfirmation ? (
            <div
              className="cleanup-confirmation"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cleanup-confirmation-title"
            >
              <strong id="cleanup-confirmation-title">
                {t("cleanArtifacts")}
              </strong>
              <p>{t("confirmCleanArtifacts")}</p>
              <ul>
                {cleanupConfirmation.map((path) => (
                  <li key={path}>{path}</li>
                ))}
              </ul>
              <div className="cleanup-confirmation-actions">
                <button
                  className="cleanup-cancel-button"
                  type="button"
                  onClick={onCancelCleanup}
                >
                  {t("cancel")}
                </button>
                <button
                  className="cleanup-confirm-button"
                  type="button"
                  onClick={onConfirmCleanup}
                >
                  {t("cleanSelected")}
                </button>
              </div>
            </div>
          ) : null}
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
