import type { RunStarted } from "../bridge";
import { useI18n } from "../i18n";
import { formatActivityMessage, type ActivityMessage } from "./activity-message";
import { formatRelative } from "../shared/format";

export interface SidebarActivityNote {
  id: number;
  at: number;
  message: ActivityMessage;
}

export function LocalActivityPanel({
  activeRun,
  projectName,
  onStop,
  lastActivity,
}: {
  activeRun?: RunStarted;
  projectName?: string;
  onStop: () => Promise<void> | void;
  lastActivity?: SidebarActivityNote | null;
}) {
  const { t, language } = useI18n();

  return (
    <div className="local-activity">
      <div className="activity-heading">
        <span className="eyebrow">{t("localActivity")}</span>
      </div>
      <div className="activity-cards">
        <div className="activity-card">
          <span className={`activity-pulse ${activeRun ? "is-running" : ""}`} />
          <div>
            <strong>{activeRun ? t("runningCommand") : t("ready")}</strong>
            <span>{activeRun?.displayCommand ?? t("noCommandRunning")}</span>
            {projectName ? (
              <small className="activity-project">{projectName}</small>
            ) : null}
          </div>
          {activeRun ? (
            <button type="button" onClick={() => void onStop()}>
              {t("stop")}
            </button>
          ) : null}
        </div>
        {/* Ambient activity log: transient results live here instead of a
            banner that pushes the project list around. */}
        {lastActivity ? (
          <div className="activity-card is-note" key={lastActivity.id}>
            <span className="activity-note-dot" aria-hidden="true" />
            <div>
              <span className="activity-note-text">
                {formatActivityMessage(lastActivity.message, language)}
              </span>
              <small className="activity-note-time">
                {formatRelative(lastActivity.at, language)}
              </small>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
