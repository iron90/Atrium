import type {
  ProfileAction,
  ProjectCommand,
  ProjectSnapshot,
} from "../../bridge";
import { useRunStream } from "../runs/run-stream-context";
import { useI18n } from "../../i18n";
import { AnimatedDisclosure } from "../../shared/AnimatedDisclosure";
import { fill } from "../../shared/format";
import { BuildProfileCard } from "./BuildProfileCard";

export function ProjectBuildProfilesSection({
  project,
  protocolReady,
  onRun,
  onOpenArtifact,
}: {
  project: ProjectSnapshot;
  protocolReady: boolean;
  onRun: (
    command: ProjectCommand,
    profileId?: string,
    profileAction?: ProfileAction,
  ) => void;
  onOpenArtifact: (
    projectPath: string,
    profileId: string,
    relativePath: string,
  ) => void;
}) {
  const { t } = useI18n();
  const { activeRun } = useRunStream();
  const buildProfiles = project.buildProfiles;
  const canExecuteProfiles = project.configuration.status === "configured";
  const showConfigurationGuidance =
    !canExecuteProfiles || buildProfiles.length === 0;

  return (
    <section className="inspector-section">
      <AnimatedDisclosure
        className="section-disclosure"
        key={project.id}
        // Guidance states (protocol missing, manifest broken) must stay
        // visible; the card list itself can stay folded.
        defaultOpen={!protocolReady || showConfigurationGuidance}
        label={t("buildProfiles")}
        meta={
          protocolReady
            ? canExecuteProfiles
              ? fill(t("profileCount"), "count", String(buildProfiles.length))
              : t("configurationMissing")
            : undefined
        }
      >
        {protocolReady && buildProfiles.length ? (
          <div className="profile-list">
            {buildProfiles.map((profile) => (
              <BuildProfileCard
                key={profile.id}
                profile={profile}
                commands={project.commands}
                artifacts={project.artifacts ?? []}
                projectPath={project.path}
                activeRun={activeRun}
                canExecute={canExecuteProfiles}
                onRun={onRun}
                onOpenArtifact={onOpenArtifact}
              />
            ))}
          </div>
        ) : null}
        {!protocolReady ? (
          <div className="protocol-prerequisite">
            <strong>{t("protocolRequired")}</strong>
            <span>{t("protocolRequiredDescription")}</span>
          </div>
        ) : showConfigurationGuidance ? (
          <div className="configuration-empty">
            <strong>
              {project.configuration.status === "missing"
                ? t("manifestMissing")
                : project.configuration.status === "invalid"
                  ? t("configurationMissing")
                  : t("noBuildProfiles")}
            </strong>
            <span>
              {project.configuration.status === "invalid"
                ? project.configuration.issues[0]
                : project.configuration.manifestPath}
            </span>
          </div>
        ) : null}
      </AnimatedDisclosure>
    </section>
  );
}
