import type { RunStarted } from "../../bridge";
import { useI18n } from "../../i18n";
import { InspectorSection } from "./InspectorPrimitives";

export function ProjectRunSection({
  activeRun,
  outputLines,
  onStop,
}: {
  activeRun?: RunStarted;
  outputLines: string[];
  onStop: () => void;
}) {
  const { t } = useI18n();
  if (!activeRun) return null;

  return (
    <InspectorSection
      title={t("liveOutput")}
      trailing={
        <button className="stop-link" type="button" onClick={onStop}>
          {t("stop")}
        </button>
      }
    >
      <div className="live-run">
        <span className="activity-pulse is-running" />
        <span>{activeRun.displayCommand}</span>
        <em>{t("running")}</em>
      </div>
      <pre className="output-console">
        {outputLines.length ? outputLines.join("\n") : t("waitingForOutput")}
      </pre>
    </InspectorSection>
  );
}
