import type { RunStarted } from "../bridge";
import { useI18n } from "../i18n";

export function LocalActivityPanel({
  activeRun,
  projectName,
  onStop,
}: {
  activeRun?: RunStarted;
  projectName?: string;
  onStop: () => Promise<void> | void;
}) {
  const { t } = useI18n();

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
      </div>
    </div>
  );
}
