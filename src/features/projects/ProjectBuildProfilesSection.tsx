import type {
  ProfileAction,
  ProjectCommand,
  ProjectSnapshot,
  RunStarted,
} from "../../bridge";
import { useI18n } from "../../i18n";
import { fill } from "../../shared/format";
import { BuildProfileCard } from "./BuildProfileCard";
import { InspectorSection } from "./InspectorPrimitives";

export function ProjectBuildProfilesSection({
  project,
  protocolReady,
  activeRun,
  onRun,
  onOpenArtifact,
}: {
  project: ProjectSnapshot;
  protocolReady: boolean;
  activeRun?: RunStarted;
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
  const buildProfiles = project.buildProfiles;
  const canExecuteProfiles = project.configuration.status === "configured";
  const showConfigurationGuidance =
    !canExecuteProfiles || buildProfiles.length === 0;

  return (
    <InspectorSection
      title={t("buildProfiles")}
      trailing={
        !protocolReady
          ? t("protocolRequired")
          : canExecuteProfiles
            ? fill(t("profileCount"), "count", String(buildProfiles.length))
            : t("configurationMissing")
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
    </InspectorSection>
  );
}
