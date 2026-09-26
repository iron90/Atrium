import { useEffect, useState } from "react";
import { bridge } from "../../bridge";
import type { ProjectSnapshot, RunFinished } from "../../bridge";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../shared/errors";
import { fill, formatRelative } from "../../shared/format";
import { renderRunLogText } from "../runs/run-log-text";
import { DetailLoading, InspectorSection } from "./InspectorPrimitives";

const MAX_VISIBLE_RUNS = 12;

interface HistoryLoadState {
  key: string;
  entries: RunFinished[];
  error: string | null;
}

function runStatusLabel(
  status: RunFinished["status"],
  t: (key: "succeeded" | "failed" | "cancelled") => string,
): string {
  if (status === "succeeded") return t("succeeded");
  if (status === "failed") return t("failed");
  return t("cancelled");
}

export function ProjectRunHistorySection({
  project,
  refreshToken = 0,
  onError,
}: {
  project: ProjectSnapshot;
  refreshToken?: number;
  onError?: (message: string | null) => void;
}) {
  const { language, t } = useI18n();
  const loadKey = `${project.id}:${refreshToken}`;
  const [state, setState] = useState<HistoryLoadState | null>(null);
  const [copiedRunId, setCopiedRunId] = useState<string | null>(null);
  const [copyFailedRunId, setCopyFailedRunId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void bridge
      .listRunHistory()
      .then((history) => {
        if (cancelled) return;
        setState({
          key: loadKey,
          entries: history
            .filter((record) => record.projectId === project.id)
            .slice(0, MAX_VISIBLE_RUNS),
          error: null,
        });
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setState({
          key: loadKey,
          entries: [],
          error: errorMessage(loadError),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [loadKey, project.id]);

  const isLoading = state?.key !== loadKey;
  const entries = state?.key === loadKey ? state.entries : [];
  const error = state?.key === loadKey ? state.error : null;

  const handleOpenLog = async (runId: string) => {
    try {
      await bridge.openRunLog(runId);
      onError?.(null);
    } catch (openError: unknown) {
      onError?.(errorMessage(openError));
    }
  };

  const handleCopyLog = async (record: RunFinished) => {
    if (!navigator.clipboard) {
      setCopyFailedRunId(record.runId);
      window.setTimeout(() => {
        setCopyFailedRunId((current) =>
          current === record.runId ? null : current,
        );
      }, 2000);
      return;
    }
    try {
      await navigator.clipboard.writeText(renderRunLogText(record));
      setCopiedRunId(record.runId);
      window.setTimeout(() => {
        setCopiedRunId((current) =>
          current === record.runId ? null : current,
        );
      }, 2000);
    } catch {
      setCopyFailedRunId(record.runId);
      window.setTimeout(() => {
        setCopyFailedRunId((current) =>
          current === record.runId ? null : current,
        );
      }, 2000);
    }
  };

  return (
    <InspectorSection
      title={t("runHistory")}
      trailing={
        isLoading
          ? undefined
          : fill(t("loaded"), "count", String(entries.length))
      }
    >
      {isLoading ? (
        <DetailLoading />
      ) : error ? (
        <p className="empty-copy">{error}</p>
      ) : entries.length ? (
        <ul className="run-history-list">
          {entries.map((record) => (
            <li className="run-history-row" key={record.runId}>
              <div className="run-history-meta">
                <span className={`run-status is-${record.status}`}>
                  {runStatusLabel(record.status, t)}
                </span>
                <code>{record.displayCommand}</code>
                <time dateTime={new Date(record.finishedAt).toISOString()}>
                  {formatRelative(record.finishedAt, language)}
                </time>
                <span className="run-history-detail">
                  {record.exitCode === null
                    ? `${Math.round(record.durationMs / 1000)}s`
                    : `${fill(t("exit"), "code", String(record.exitCode))} · ${Math.round(record.durationMs / 1000)}s`}
                </span>
              </div>
              <div className="run-history-actions">
                <button
                  className="text-button"
                  type="button"
                  onClick={() => void handleCopyLog(record)}
                >
                  {copiedRunId === record.runId
                    ? t("runLogCopied")
                    : copyFailedRunId === record.runId
                      ? t("copyFailed")
                      : t("copyRunLog")}
                </button>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => void handleOpenLog(record.runId)}
                >
                  {t("openRunLog")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-copy">{t("noRunHistory")}</p>
      )}
    </InspectorSection>
  );
}
