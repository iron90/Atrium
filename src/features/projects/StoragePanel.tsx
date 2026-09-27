import type {
  CleanupProgress,
  ProjectSnapshot,
  ProjectStorage,
} from "../../bridge";
import { useEffect, useRef } from "react";
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
  const confirmationRef = useRef<HTMLDivElement | null>(null);

  // A modal dialog that never receives focus (and lets Tab wander into the
  // page behind it) is worse than none for keyboard and screen reader users.
  useEffect(() => {
    if (!cleanupConfirmation) return undefined;
    const dialog = confirmationRef.current;
    dialog?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancelCleanup();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>("button"),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [cleanupConfirmation, onCancelCleanup]);

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
            {/* The percent lives in the progress block below; a second one
                inside the button reads as two competing progress displays. */}
            {isCleaningArtifacts ? t("cleaningArtifacts") : t("cleanSelected")}
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
              ref={confirmationRef}
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
