import { useI18n } from "../i18n";

// One card, one runtime fact. Priority when several apply:
// running > scanning > error > ready.
export type RuntimeStatus =
  | { kind: "running"; command: string; projectName?: string }
  | { kind: "scanning" }
  | { kind: "error"; message: string }
  | { kind: "ready" };

export function LocalActivityPanel({
  status,
  onStop,
}: {
  status: RuntimeStatus;
  onStop: () => Promise<void> | void;
}) {
  const { t } = useI18n();

  if (status.kind === "error") {
    return (
      <div className="local-activity">
        <div className="activity-heading">
          <span className="eyebrow">{t("localActivity")}</span>
        </div>
        <div className="activity-cards">
          <div className="activity-card is-error" title={status.message}>
            <span className="activity-pulse is-error" />
            <div>
              <strong>{t("runtimeError")}</strong>
              <span className="activity-error-message">{status.message}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="local-activity">
      <div className="activity-heading">
        <span className="eyebrow">{t("localActivity")}</span>
      </div>
      <div className="activity-cards">
        <div className="activity-card">
          <span
            className={`activity-pulse ${status.kind === "running" ? "is-running" : ""}`}
          />
          <div>
            <strong>
              {status.kind === "running"
                ? t("runningCommand")
                : status.kind === "scanning"
                  ? t("scanningWorkspace")
                  : t("ready")}
            </strong>
            <span>
              {status.kind === "running"
                ? status.command
                : status.kind === "scanning"
                  ? t("scanningHint")
                  : t("noCommandRunning")}
            </span>
            {status.kind === "running" && status.projectName ? (
              <small className="activity-project">{status.projectName}</small>
            ) : null}
          </div>
          {status.kind === "running" ? (
            <button type="button" onClick={() => void onStop()}>
              {t("stop")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
