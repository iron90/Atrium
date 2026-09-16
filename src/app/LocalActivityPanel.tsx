import type { RunStarted, WorkspaceSnapshot } from "../bridge";
import { useI18n } from "../i18n";
import type { ActivityMessage } from "./activity-message";
import { formatActivityMessage } from "./activity-message";
import { fill, formatRelative } from "../shared/format";

export function LocalActivityPanel({
  activeRun,
  message,
  onStop,
  snapshot,
}: {
  activeRun?: RunStarted;
  message: ActivityMessage;
  onStop: () => Promise<void> | void;
  snapshot: WorkspaceSnapshot;
}) {
  const { language, t } = useI18n();

  return (
    <div className="local-activity">
      <div className="activity-heading">
        <span className="eyebrow">{t("localActivity")}</span>
        <span>{formatActivityMessage(message, language)}</span>
      </div>
      <div className="activity-cards">
        <div className="activity-card">
          <span className={`activity-pulse ${activeRun ? "is-running" : ""}`} />
          <div>
            <strong>{activeRun ? t("runningCommand") : t("ready")}</strong>
            <span>{activeRun?.displayCommand ?? t("noCommandRunning")}</span>
          </div>
          {activeRun ? (
            <button type="button" onClick={() => void onStop()}>
              {t("stop")}
            </button>
          ) : null}
        </div>
        <div className="activity-card">
          <span className="activity-icon" aria-hidden="true">
            ◷
          </span>
          <div>
            <strong>{t("recentScan")}</strong>
            <span>
              {fill(
                t("projectsDiscovered"),
                "count",
                String(snapshot.projects.length),
              )}{" "}
              · {formatRelative(snapshot.scannedAt, language)}
            </span>
          </div>
          <span className="activity-result">
            {snapshot.warnings.length
              ? fill(t("notes"), "count", String(snapshot.warnings.length))
              : t("noWarnings")}
          </span>
        </div>
      </div>
    </div>
  );
}
