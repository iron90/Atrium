import type { ProjectCommand, ProjectSnapshot } from "../../bridge";
import { useRunStream } from "../runs/run-stream-context";
import { useI18n } from "../../i18n";
import { DetailLoading, InspectorSection } from "./InspectorPrimitives";
import { commandLabel } from "./presentation";
import { fill } from "../../shared/format";
import { AnimatedDisclosure } from "../../shared/AnimatedDisclosure";

export interface ProjectCommandsSectionProps {
  project: ProjectSnapshot;
  isLoading: boolean;
  onRun: (command: ProjectCommand) => void;
  rawCommandsRevealed: boolean;
  onRevealRawCommands: () => void;
}

export function ProjectCommandsSection({
  project,
  isLoading,
  onRun,
  rawCommandsRevealed,
  onRevealRawCommands,
}: ProjectCommandsSectionProps) {
  const { language, t } = useI18n();
  const { activeRun } = useRunStream();
  const primaryCommands = project.commands.filter(
    (command) => command.kind !== "other",
  );
  const otherCommands = project.commands.filter(
    (command) => command.kind === "other",
  );

  return (
    <InspectorSection
      title={t("rawRepositoryCommands")}
      trailing={
        isLoading
          ? t("waitingForOutput")
          : project.commands.length
            ? fill(
                t("source"),
                "value",
                project.commands[0].source.split("#")[0],
              )
            : undefined
      }
    >
      {isLoading ? (
        <DetailLoading />
      ) : (
        <>
          {!project.commands.length ? (
            <p className="empty-copy">{t("noKnownEntrypoint")}</p>
          ) : !rawCommandsRevealed ? (
            <div className="command-disclosure">
              <strong>
                {fill(
                  t("discoveredCommandsCount"),
                  "count",
                  String(project.commands.length),
                )}
              </strong>
              <span>{t("discoveredCommandsWarning")}</span>
              <button
                className="command-disclosure-button"
                type="button"
                onClick={onRevealRawCommands}
              >
                {t("revealDiscoveredCommands")}
              </button>
            </div>
          ) : (
            <>
              <div className="entrypoint-list">
                {primaryCommands.length ? (
                  primaryCommands.map((command) => (
                    <button
                      className={`entrypoint-button command-${command.kind}`}
                      type="button"
                      key={command.id}
                      onClick={() => onRun(command)}
                      disabled={Boolean(activeRun)}
                      title={command.displayCommand}
                    >
                      <span className="entrypoint-icon" aria-hidden="true">
                        {command.kind === "run"
                          ? "▷"
                          : command.kind === "check"
                            ? "✓"
                            : "↗"}
                      </span>
                      <span>
                        <strong>{commandLabel(command, language)}</strong>
                        <small>{command.displayCommand}</small>
                      </span>
                      <span className="entrypoint-arrow" aria-hidden="true">
                        →
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="empty-copy">{t("noKnownEntrypoint")}</p>
                )}
              </div>
              {otherCommands.length ? (
                <AnimatedDisclosure
                  className="other-commands"
                  label={fill(
                    t("otherCommands"),
                    "count",
                    String(otherCommands.length),
                  )}
                >
                  {otherCommands.map((command) => (
                    <button
                      className="other-command-item"
                      type="button"
                      key={command.id}
                      onClick={() => onRun(command)}
                      disabled={Boolean(activeRun)}
                    >
                      {command.displayCommand}
                    </button>
                  ))}
                </AnimatedDisclosure>
              ) : null}
            </>
          )}
        </>
      )}
    </InspectorSection>
  );
}
