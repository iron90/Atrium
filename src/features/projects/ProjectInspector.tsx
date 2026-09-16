import { useState } from "react";
import type { ReactNode } from "react";
import type {
  BuildArtifact,
  BuildProfile,
  Facet,
  ProjectCommand,
  ProjectSnapshot,
  ProjectStorage,
  RunStarted,
} from "../../bridge";
import { CommitList } from "../git/CommitList";
import { useI18n, localizedFacetLabel } from "../../i18n";
import { FacetMark } from "./FacetMark";
import { facetTitle } from "./facets";
import { ProjectIconView } from "./ProjectIconView";
import {
  artifactKindLabel,
  capabilityLabel,
  capabilityStatusLabel,
  commandForProfile,
  commandLabel,
  protocolManifestLabel,
  statusClass,
  statusLabel,
  storageKindLabel,
  syncStatusAriaLabel,
  syncStatusClass,
  syncStatusVisual,
} from "./presentation";
import type { ProfileAction } from "../runs/use-project-runner";
import { fill, formatBytes, formatTime } from "../../shared/format";

export interface CleanupFeedback {
  removedBytes: number;
  failedCount: number;
}

export interface ProjectInspectorProps {
  project?: ProjectSnapshot;
  details?: ProjectSnapshot;
  isLoading: boolean;
  activeRun?: RunStarted;
  outputLines: string[];
  onRun: (
    command: ProjectCommand,
    profileId?: string,
    profileAction?: ProfileAction,
  ) => void;
  onRefreshProject: (project: ProjectSnapshot) => void;
  isRefreshing: boolean;
  onStop: () => void;
  onGenerateGuidance: (project: ProjectSnapshot) => void;
  guidanceMessage: string | null;
  agentPrompt: string | null;
  isAgentPromptCopied: boolean;
  onCopyAgentPrompt: () => void;
  isWritingGuidance: boolean;
  cleanupFeedback: CleanupFeedback | null;
  cleanupSelection: string[];
  onCleanupSelectionChange: (paths: string[]) => void;
  isCleaningArtifacts: boolean;
  onCleanArtifacts: (project: ProjectSnapshot) => void;
  onOpenArtifact: (
    projectPath: string,
    profileId: string,
    relativePath: string,
  ) => void;
  onOpenProjectAction: (
    action: "directory" | "terminal" | "remote" | "link",
    project: ProjectSnapshot,
    linkId?: string,
  ) => void;
}

export function ProjectInspector({
  project,
  details,
  isLoading,
  activeRun,
  outputLines,
  onRun,
  onRefreshProject,
  isRefreshing,
  onStop,
  onGenerateGuidance,
  guidanceMessage,
  agentPrompt,
  isAgentPromptCopied,
  onCopyAgentPrompt,
  isWritingGuidance,
  cleanupFeedback,
  cleanupSelection,
  onCleanupSelectionChange,
  isCleaningArtifacts,
  onCleanArtifacts,
  onOpenArtifact,
  onOpenProjectAction,
}: ProjectInspectorProps) {
  const { language, t } = useI18n();
  const [rawCommandsRevealedFor, setRawCommandsRevealedFor] = useState<
    string | null
  >(null);

  if (!project) {
    return (
      <aside className="inspector empty-inspector">
        <span>◇</span>
        <p>{t("selectProject")}</p>
      </aside>
    );
  }

  const inspectedProject = details ?? project;
  const rawCommandsRevealed = rawCommandsRevealedFor === project.id;
  const buildProfiles = inspectedProject.buildProfiles;
  const iconConformance = inspectedProject.iconConformance;
  const protocol = inspectedProject.protocol;
  const coreCapabilities = protocol.capabilities.filter(
    (capability) => capability.id !== "cleanup",
  );
  const protocolReady =
    protocol.manifestStatus === "configured" &&
    coreCapabilities.length > 0 &&
    coreCapabilities.every((capability) => capability.status === "configured");
  const protocolCardStatus =
    protocol.manifestStatus !== "configured"
      ? protocol.manifestStatus
      : protocol.capabilities.some(
            (capability) => capability.status !== "configured",
          )
        ? "partial"
        : "configured";
  const protocolDetailsSummary = fill(
    t("protocolDetailsSummary"),
    "count",
    String(protocol.capabilities.length),
  );
  const canExecuteProfiles =
    inspectedProject.configuration.status === "configured";
  const showConfigurationGuidance =
    !canExecuteProfiles || buildProfiles.length === 0;
  const cleanupCapability = protocol.capabilities.find(
    (capability) => capability.id === "cleanup",
  );
  const showProtocolGuidance =
    !protocolReady ||
    showConfigurationGuidance ||
    cleanupCapability?.status === "invalid";
  const primaryCommands = inspectedProject.commands.filter(
    (command) => command.kind !== "other",
  );
  const otherCommands = inspectedProject.commands.filter(
    (command) => command.kind === "other",
  );
  const repo = inspectedProject.repo;
  const storage = inspectedProject.storage;

  return (
    <aside className="inspector">
      <div className="inspector-header">
        <ProjectIconView project={project} variant="inspector" />
        <div>
          <span className="eyebrow">{t("selectedProject")}</span>
          <h2>{project.name}</h2>
          <p>{project.description ?? t("descriptionMissing")}</p>
        </div>
        <button
          className="inspector-refresh"
          type="button"
          onClick={() => onRefreshProject(project)}
          disabled={isRefreshing}
          title={t("refreshProject")}
        >
          {isRefreshing ? "↻" : "⟳"}
          <span className="sr-only">
            {isRefreshing ? t("refreshingProject") : t("refreshProject")}
          </span>
        </button>
      </div>

      <InspectorSection title={t("repository")}>
        <div className="repo-path">
          <span aria-hidden="true">⌁</span>
          <span title={project.path}>{project.path}</span>
        </div>
        {isLoading ? (
          <DetailLoading />
        ) : (
          <>
            <div className="repo-facts">
              <span>
                <strong>{t("branch")}</strong>
                {repo?.branch ?? t("unavailable")}
              </span>
              <span>
                <strong>{t("worktree")}</strong>
                <em className={statusClass(inspectedProject)}>
                  {statusLabel(inspectedProject, language)}
                </em>
              </span>
              {repo ? (
                <span>
                  <strong>{t("syncStatus")}</strong>
                  <em
                    className={`git-sync ${syncStatusClass(repo)}`}
                    title={syncStatusAriaLabel(repo, language)}
                  >
                    <span aria-hidden="true">{syncStatusVisual(repo)}</span>
                    <span className="sr-only">
                      {syncStatusAriaLabel(repo, language)}
                    </span>
                  </em>
                </span>
              ) : null}
            </div>
            {repo?.remote ? (
              <div className="remote-line">
                <span>{t("remote")}</span>
                <span>{repo.remote}</span>
              </div>
            ) : null}
          </>
        )}
      </InspectorSection>

      <InspectorSection title={t("projectTools")}>
        <div className="project-tool-bar">
          <button
            type="button"
            onClick={() => onOpenProjectAction("directory", inspectedProject)}
          >
            {t("openFolder")}
          </button>
          <button
            type="button"
            onClick={() => onOpenProjectAction("terminal", inspectedProject)}
          >
            {t("openTerminal")}
          </button>
          {repo?.remote ? (
            <button
              type="button"
              onClick={() => onOpenProjectAction("remote", inspectedProject)}
            >
              {t("openRemote")}
            </button>
          ) : null}
        </div>
        {inspectedProject.links?.length ? (
          <div className="project-links">
            {inspectedProject.links.map((link) => (
              <button
                type="button"
                key={link.id}
                onClick={() =>
                  onOpenProjectAction("link", inspectedProject, link.id)
                }
              >
                {link.label}
              </button>
            ))}
          </div>
        ) : null}
      </InspectorSection>

      <InspectorSection title={t("atriumProtocol")}>
        <div className={`protocol-card protocol-status-${protocolCardStatus}`}>
          <div>
            <strong>{protocolManifestLabel(protocol.manifestStatus, t)}</strong>
            <span>{t("iconConformanceDescription")}</span>
          </div>
          {showProtocolGuidance ? (
            <button
              className="protocol-action"
              type="button"
              onClick={() => onGenerateGuidance(project)}
              disabled={isWritingGuidance}
            >
              {isWritingGuidance
                ? t("generatingGuidance")
                : t("generateGuidance")}
            </button>
          ) : null}
        </div>
        <details className="protocol-details" key={project.id}>
          <summary>
            <span>{t("protocolDetails")}</span>
            <span>{protocolDetailsSummary}</span>
          </summary>
          <div className="protocol-details-body">
            <div className="protocol-path">
              <span>{protocol.manifestPath}</span>
              <span>
                {protocol.schema
                  ? fill(
                      t("protocolSchema"),
                      "version",
                      String(protocol.schema),
                    )
                  : t("protocolSchemaUnavailable")}
              </span>
            </div>
            <div
              className="protocol-capabilities"
              aria-label={t("protocolCapabilities")}
            >
              {protocol.capabilities.map((capability) => (
                <div
                  className={`protocol-capability capability-${capability.status}`}
                  key={capability.id}
                  title={
                    capability.issues.join(" ") ||
                    capability.evidence.join(", ")
                  }
                >
                  <span className="capability-dot" />
                  <span>
                    <strong>{capabilityLabel(capability.id, t)}</strong>
                    <small>{capabilityStatusLabel(capability.status, t)}</small>
                  </span>
                </div>
              ))}
            </div>
            <div className="protocol-path protocol-icon-path">
              <span>
                {iconConformance?.manifestPath ?? protocol.manifestPath}
              </span>
              <span>
                {iconConformance?.resolvedIcon ?? t("iconStatusMissing")}
              </span>
            </div>
          </div>
        </details>
        {guidanceMessage ? (
          <p className="protocol-message">{guidanceMessage}</p>
        ) : null}
        {agentPrompt ? (
          <div className="agent-prompt-card">
            <div className="agent-prompt-heading">
              <div>
                <strong>{t("agentPromptTitle")}</strong>
                <span>{t("agentPromptDescription")}</span>
              </div>
              <button
                className="protocol-action"
                type="button"
                onClick={onCopyAgentPrompt}
              >
                {isAgentPromptCopied
                  ? t("agentPromptCopied")
                  : t("copyAgentPrompt")}
              </button>
            </div>
            <textarea
              className="agent-prompt"
              readOnly
              value={agentPrompt}
              aria-label={t("agentPromptTitle")}
              rows={10}
            />
          </div>
        ) : null}
      </InspectorSection>

      <InspectorSection
        title={t("storage")}
        trailing={storage ? formatBytes(storage.totalBytes) : undefined}
      >
        {isLoading ? (
          <DetailLoading />
        ) : storage ? (
          <StoragePanel
            project={project}
            storage={storage}
            cleanupFeedback={cleanupFeedback}
            cleanupSelection={cleanupSelection}
            onCleanupSelectionChange={onCleanupSelectionChange}
            isCleaningArtifacts={isCleaningArtifacts}
            onCleanArtifacts={onCleanArtifacts}
          />
        ) : (
          <p className="empty-copy">{t("storageUnavailable")}</p>
        )}
      </InspectorSection>

      <InspectorSection title={t("detectedContext")}>
        {protocolReady ? (
          <>
            <FacetDetail
              label={t("platforms")}
              facets={inspectedProject.platforms}
              kind="platform"
            />
            <FacetDetail
              label={t("channels")}
              facets={inspectedProject.channels}
              kind="channel"
            />
          </>
        ) : (
          <div className="protocol-prerequisite">
            <strong>{t("protocolRequired")}</strong>
            <span>{t("protocolRequiredDescription")}</span>
          </div>
        )}
      </InspectorSection>

      <InspectorSection
        title={t("buildProfiles")}
        trailing={
          !protocolReady
            ? t("protocolRequired")
            : inspectedProject.configuration.status === "configured"
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
                commands={inspectedProject.commands}
                artifacts={inspectedProject.artifacts ?? []}
                projectPath={inspectedProject.path}
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
              {inspectedProject.configuration.status === "missing"
                ? t("manifestMissing")
                : inspectedProject.configuration.status === "invalid"
                  ? t("configurationMissing")
                  : t("noBuildProfiles")}
            </strong>
            <span>
              {inspectedProject.configuration.status === "invalid"
                ? inspectedProject.configuration.issues[0]
                : inspectedProject.configuration.manifestPath}
            </span>
          </div>
        ) : null}
      </InspectorSection>

      <InspectorSection
        title={t("rawRepositoryCommands")}
        trailing={
          isLoading
            ? t("waitingForOutput")
            : inspectedProject.commands.length
              ? fill(
                  t("source"),
                  "value",
                  inspectedProject.commands[0].source.split("#")[0],
                )
              : undefined
        }
      >
        {isLoading ? (
          <DetailLoading />
        ) : (
          <>
            <p className="entrypoint-note">{t("rawCommandDescription")}</p>
            {!inspectedProject.commands.length ? (
              <p className="empty-copy">{t("noKnownEntrypoint")}</p>
            ) : !rawCommandsRevealed ? (
              <div className="command-disclosure">
                <strong>
                  {fill(
                    t("discoveredCommandsCount"),
                    "count",
                    String(inspectedProject.commands.length),
                  )}
                </strong>
                <span>{t("discoveredCommandsWarning")}</span>
                <button
                  className="command-disclosure-button"
                  type="button"
                  onClick={() => setRawCommandsRevealedFor(project.id)}
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
                  <details className="other-commands">
                    <summary>
                      {fill(
                        t("otherCommands"),
                        "count",
                        String(otherCommands.length),
                      )}
                    </summary>
                    {otherCommands.map((command) => (
                      <button
                        type="button"
                        key={command.id}
                        onClick={() => onRun(command)}
                        disabled={Boolean(activeRun)}
                      >
                        {command.displayCommand}
                      </button>
                    ))}
                  </details>
                ) : null}
              </>
            )}
          </>
        )}
      </InspectorSection>

      {activeRun ? (
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
            {outputLines.length
              ? outputLines.join("\n")
              : t("waitingForOutput")}
          </pre>
        </InspectorSection>
      ) : null}

      <InspectorSection
        title={t("recentCommits")}
        trailing={
          isLoading
            ? t("waitingForOutput")
            : repo
              ? fill(t("loaded"), "count", String(repo.recentCommits.length))
              : undefined
        }
      >
        {isLoading ? (
          <DetailLoading />
        ) : repo?.recentCommits.length ? (
          <CommitList commits={repo.recentCommits.slice(0, 5)} />
        ) : (
          <p className="empty-copy">{t("gitHistoryUnavailable")}</p>
        )}
      </InspectorSection>

      <div className="inspector-footnote">
        <span className="fact-key" /> {t("detectedFacts")}
      </div>
    </aside>
  );
}

function DetailLoading() {
  const { t } = useI18n();
  return (
    <div className="details-loading" aria-label={t("loadingDetails")}>
      <span className="loading-line loading-line-long" />
      <span className="loading-line" />
      <span className="loading-line loading-line-short" />
    </div>
  );
}

function StoragePanel({
  project,
  storage,
  cleanupFeedback,
  cleanupSelection,
  onCleanupSelectionChange,
  isCleaningArtifacts,
  onCleanArtifacts,
}: {
  project: ProjectSnapshot;
  storage: ProjectStorage;
  cleanupFeedback: CleanupFeedback | null;
  cleanupSelection: string[];
  onCleanupSelectionChange: (paths: string[]) => void;
  isCleaningArtifacts: boolean;
  onCleanArtifacts: (project: ProjectSnapshot) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="storage-panel">
      <div className="storage-summary">
        <div>
          <strong>{formatBytes(storage.totalBytes)}</strong>
          <span>{t("projectStorage")}</span>
        </div>
        <div>
          <strong>{formatBytes(storage.cleanableBytes)}</strong>
          <span>{t("cleanableStorage")}</span>
        </div>
      </div>

      {storage.entries.length ? (
        <>
          <div className="storage-entry-list">
            {storage.entries.map((entry) => (
              <label
                className={`storage-entry storage-${entry.kind}`}
                key={entry.relativePath}
              >
                <input
                  type="checkbox"
                  checked={cleanupSelection.includes(entry.relativePath)}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...cleanupSelection, entry.relativePath]
                      : cleanupSelection.filter(
                          (path) => path !== entry.relativePath,
                        );
                    onCleanupSelectionChange(next);
                  }}
                />
                <div>
                  <strong>{entry.relativePath}</strong>
                  <span>
                    {storageKindLabel(entry, t)} ·{" "}
                    {fill(t("storageFiles"), "count", String(entry.fileCount))}
                  </span>
                </div>
                <em>{formatBytes(entry.bytes)}</em>
              </label>
            ))}
          </div>
          <button
            className="cleanup-button"
            type="button"
            onClick={() => onCleanArtifacts(project)}
            disabled={isCleaningArtifacts || !cleanupSelection.length}
          >
            {isCleaningArtifacts ? t("cleaningArtifacts") : t("cleanSelected")}
          </button>
          {cleanupFeedback ? (
            <p
              className={`cleanup-message ${
                cleanupFeedback.failedCount ? "is-warning" : ""
              }`}
            >
              {cleanupFeedback.failedCount
                ? fill(
                    t("cleanupCompletedWithFailures"),
                    "size",
                    formatBytes(cleanupFeedback.removedBytes),
                  ).replace("{count}", String(cleanupFeedback.failedCount))
                : fill(
                    t("cleanupCompleted"),
                    "size",
                    formatBytes(cleanupFeedback.removedBytes),
                  )}
            </p>
          ) : null}
        </>
      ) : (
        <p className="empty-copy">{t("noCleanableArtifacts")}</p>
      )}
    </div>
  );
}

function BuildProfileCard({
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
                        ? `${artifactKindLabel(artifact, t)} · ${formatBytes(artifact.bytes)} · ${fill(t("artifactFiles"), "count", String(artifact.fileCount))}`
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

function InspectorSection({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="inspector-section">
      <div className="section-heading">
        <h3>{title}</h3>
        {trailing ? <span>{trailing}</span> : null}
      </div>
      {children}
    </section>
  );
}

function FacetDetail({
  label,
  facets,
  kind,
}: {
  label: string;
  facets: Facet[];
  kind: "platform" | "channel";
}) {
  const { language, t } = useI18n();

  return (
    <div className="facet-detail">
      <span>{label}</span>
      <div>
        {facets.length ? (
          facets.map((facet) => (
            <span
              className={`detail-chip ${kind === "platform" ? "platform-detail-chip" : ""}`}
              key={facet.key}
              title={facetTitle(language, facet)}
              aria-label={
                kind === "platform"
                  ? localizedFacetLabel(language, facet.key, facet.label)
                  : undefined
              }
            >
              <FacetMark facet={facet} kind={kind} />
              {kind === "channel"
                ? localizedFacetLabel(language, facet.key, facet.label)
                : null}
            </span>
          ))
        ) : (
          <span className="muted-inline">{t("noEvidence")}</span>
        )}
      </div>
    </div>
  );
}
