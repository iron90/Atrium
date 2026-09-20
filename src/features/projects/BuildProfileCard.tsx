import type {
  BuildArtifact,
  BuildProfile,
  HostOs,
  ProfileAction,
  ProjectCommand,
  RunStarted,
} from "../../bridge";
import { useI18n, localizedFacetLabel } from "../../i18n";
import { fill, formatBytes, formatTime } from "../../shared/format";
import { artifactKindLabel, commandForProfile } from "./presentation";

const hostLabels: Record<HostOs, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
};

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
  const actions: ProfileAction[] = ["check", "build", "run"];
  const profileReady = canExecute && profile.issues.length === 0;
  const profileArtifacts = artifacts.filter(
    (artifact) => artifact.profileId === profile.id,
  );
  const hasAvailableArtifact = profileArtifacts.some(
    (artifact) => artifact.kind === "file" || artifact.kind === "directory",
  );
  const unsupportedAction = profile.unsupportedActions[0];
  const unsupportedHosts = unsupportedAction
    ? profile.hostRequirements[unsupportedAction]
    : null;
  const profileHostMessage =
    unsupportedAction === "run"
      ? t("profileRunHostUnsupported")
      : unsupportedHosts?.length
        ? fill(
            t("profileHostUnsupportedWithHosts"),
            "hosts",
            unsupportedHosts.map((host) => hostLabels[host]).join(" / "),
          )
        : t("profileHostUnsupported");

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
          const runBlockedUntilBuild =
            action === "run" && profileReady && !hasAvailableArtifact;
          const hostUnsupported = profile.unsupportedActions.includes(action);
          const hostUnsupportedMessage =
            action === "run"
              ? t("profileRunHostUnsupported")
              : profile.hostRequirements[action]?.length
                ? fill(
                    t("profileHostUnsupportedWithHosts"),
                    "hosts",
                    profile.hostRequirements[action]
                      .map((host) => hostLabels[host])
                      .join(" / "),
                  )
                : t("profileHostUnsupported");
          const actionDisabled =
            Boolean(activeRun) ||
            !profileReady ||
            runBlockedUntilBuild ||
            hostUnsupported;
          const actionTitle = !canExecute
            ? t("configurationMissing")
            : profile.issues.length
              ? t("profileUnavailable")
              : hostUnsupported
                ? hostUnsupportedMessage
                : runBlockedUntilBuild
                  ? t("buildRequiredToRun")
                  : command.displayCommand;
          const actionButton = (
            <button
              className={`profile-action command-${action}`}
              type="button"
              key={action}
              onClick={() => onRun(command, profile.id, action)}
              disabled={actionDisabled}
              title={actionTitle}
            >
              {action === "run"
                ? t("run")
                : action === "check"
                  ? t("check")
                  : t("build")}
            </button>
          );
          return runBlockedUntilBuild ? (
            <span
              className="profile-action-hint"
              key={action}
              title={t("buildRequiredToRun")}
            >
              {actionButton}
            </span>
          ) : (
            actionButton
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
      ) : profile.unsupportedActions.length ? (
        <span className="profile-issue">{profileHostMessage}</span>
      ) : null}
    </div>
  );
}
