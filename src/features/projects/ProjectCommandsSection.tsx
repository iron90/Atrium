import type { ProjectCommand, ProjectSnapshot } from "../../bridge";
import { useRunStream } from "../runs/run-stream-context";
import { useI18n } from "../../i18n";
import { DetailLoading, InspectorSection } from "./InspectorPrimitives";
import { AnimatedDisclosure } from "../../shared/AnimatedDisclosure";
import { fill } from "../../shared/format";

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
  const { t } = useI18n();
  const { activeRun } = useRunStream();

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
            <AnimatedDisclosure
              className="commands-disclosure"
              key={project.id}
              label={fill(
                t("repositoryCommands"),
                "count",
                String(project.commands.length),
              )}
            >
              <div className="command-list">
                {project.commands.map((command) => (
                  <button
                    className="command-item"
                    type="button"
                    key={command.id}
                    onClick={() => onRun(command)}
                    disabled={Boolean(activeRun)}
                    title={command.displayCommand}
                  >
                    {command.displayCommand}
                  </button>
                ))}
              </div>
            </AnimatedDisclosure>
          )}
        </>
      )}
    </InspectorSection>
  );
}
