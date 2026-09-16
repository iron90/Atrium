import type {
  BuildArtifact,
  BuildProfile,
  ProfileAction,
  ProjectCommand,
  RunStarted,
} from "../../bridge";
import { useI18n, localizedFacetLabel } from "../../i18n";
import { fill, formatBytes, formatTime } from "../../shared/format";
import { artifactKindLabel, commandForProfile } from "./presentation";

export function BuildProfileCard({
  profile,
  commands,
  artifacts,
  projectPath,
  activeRun,
  canExecute,
  onRun,
  onOpenArtifact,
}: {
  profile: BuildProfile;
  commands: ProjectCommand[];
  artifacts: BuildArtifact[];
  projectPath: string;
  activeRun?: RunStarted;
  canExecute: boolean;
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
  const { language, t } = useI18n();
  const actions: ProfileAction[] = ["run", "check", "build"];
  const profileReady = canExecute && profile.issues.length === 0;
  const profileArtifacts = artifacts.filter(
    (artifact) => artifact.profileId === profile.id,
  );

  return (
    <div className="profile-card">
      <div className="profile-heading">
        <div>
          <strong>{profile.label}</strong>
          <span>
            {localizedFacetLabel(
              language,
              profile.platform.key,
              profile.platform.label,
            )}
            <i aria-hidden="true">·</i>
            {localizedFacetLabel(
              language,
              profile.channel.key,
              profile.channel.label,
            )}
          </span>
        </div>
        <span className="profile-source" title={profile.source}>
          {profile.id}
        </span>
      </div>
      <div className="profile-actions">
        {actions.map((action) => {
          const command = commandForProfile(profile, action, commands);
          if (!command) return null;
          return (
            <button
              className={`profile-action command-${action}`}
              type="button"
              key={action}
              onClick={() => onRun(command, profile.id, action)}
              disabled={Boolean(activeRun) || !profileReady}
              title={
                !canExecute
                  ? t("configurationMissing")
                  : profile.issues.length
                    ? t("profileUnavailable")
                    : command.displayCommand
              }
            >
              {action === "run"
                ? t("run")
                : action === "check"
                  ? t("check")
                  : t("build")}
            </button>
          );
        })}
      </div>
      <div className="artifact-declarations">
        <span className="artifact-heading">{t("profileArtifacts")}</span>
        {profile.artifacts.length ? (
          <div className="artifact-list">
            {profile.artifacts.map((relativePath) => {
              const artifact = profileArtifacts.find(
                (candidate) => candidate.relativePath === relativePath,
              );
              const canOpen =
                artifact?.kind === "file" || artifact?.kind === "directory";
              return (
                <div className="artifact-row" key={relativePath}>
                  <span className="artifact-copy">
                    <strong>{relativePath}</strong>
                    <small>
                      {artifact
                        ? `${artifactKindLabel(artifact, t)} · ${formatBytes(artifact.bytes)} · ${fill(t("artifactFiles"), "count", String(artifact.fileCount))}${artifact.isComplete ? "" : ` · ${t("artifactMetricsIncomplete")}`}`
                        : t("artifactUnavailable")}
                      {artifact?.modifiedAt
                        ? ` · ${fill(t("artifactUpdated"), "time", formatTime(artifact.modifiedAt, language))}`
                        : ""}
                    </small>
                  </span>
                  <button
                    className="artifact-open"
                    type="button"
                    disabled={!canOpen}
                    onClick={() =>
                      onOpenArtifact(projectPath, profile.id, relativePath)
                    }
                    title={
                      canOpen ? t("openArtifact") : t("artifactUnavailable")
                    }
                  >
                    {t("openArtifact")}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <span className="muted-inline">{t("noArtifactsDeclared")}</span>
        )}
      </div>
      {profile.issues.length ? (
        <span className="profile-issue">{profile.issues[0]}</span>
      ) : null}
    </div>
  );
}
