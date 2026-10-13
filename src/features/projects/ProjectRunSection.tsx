import type { FinishedRunRecord } from "../runs/use-run-event-stream";
import { useRunStream } from "../runs/run-stream-context";
import { useI18n } from "../../i18n";
import { fill } from "../../shared/format";
import { ScrollArea } from "../../shared/ScrollArea";
import { InspectorSection } from "./InspectorPrimitives";
import { looksLikeMissingDependency } from "./missing-dependency-signature";

export function ProjectRunSection({
  lastFinishedRun,
  onStop,
}: {
  lastFinishedRun?: FinishedRunRecord;
  onStop: () => void;
}) {
  const { t } = useI18n();
  const { activeRun, outputLines } = useRunStream();
  if (activeRun) {
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
        <ScrollArea viewportComponent="pre" viewportClassName="output-console">
          {outputLines.length ? outputLines.join("\n") : t("waitingForOutput")}
        </ScrollArea>
      </InspectorSection>
    );
  }

  if (!lastFinishedRun) return null;

  const { run, lines } = lastFinishedRun;
  const statusLabel =
    run.status === "succeeded"
      ? t("succeeded")
      : run.status === "failed"
        ? t("failed")
        : t("cancelled");
  const exitLabel =
    run.exitCode === null
      ? null
      : fill(t("exit"), "code", String(run.exitCode));
  const meta = [exitLabel, `${Math.round(run.durationMs / 1000)}s`]
    .filter(Boolean)
    .join(" · ");
  const consoleText = lines.length
    ? lines.join("\n")
    : run.stdout
      ? run.stdout
      : run.stderr || t("waitingForOutput");
  // Labelled as a guess on purpose: the output alone cannot tell a missing
  // dependency apart from a project error that mentions one.
  const suspectMissingDependency =
    run.status === "failed" &&
    looksLikeMissingDependency(`${consoleText}\n${run.stderr}`);

  return (
    <InspectorSection title={t("lastRunResult")}>
      <div className={`live-run is-${run.status}`}>
        <span className="activity-pulse" />
        <span>{run.displayCommand}</span>
        <em>
          {statusLabel}
          {meta ? ` · ${meta}` : ""}
        </em>
      </div>
      <ScrollArea viewportComponent="pre" viewportClassName="output-console">
        {consoleText}
      </ScrollArea>
      {suspectMissingDependency ? (
        <p className="profile-issue">{t("dependencyHintGuess")}</p>
      ) : null}
    </InspectorSection>
  );
}
