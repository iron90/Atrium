import { useState } from "react";
import type {
  ProfileAction,
  ProjectCommand,
  ProjectSnapshot,
  RunStarted,
} from "../../bridge";
import { CommitList } from "../git/CommitList";
import { useI18n } from "../../i18n";
import { ProjectIconView } from "./ProjectIconView";
import { BuildProfileCard } from "./BuildProfileCard";
import { ProjectCommandsSection } from "./ProjectCommandsSection";
import { ProjectProtocolSection } from "./ProjectProtocolSection";
import type { ProjectAction } from "./project-actions";
import {
  DetailLoading,
  FacetDetail,
  InspectorSection,
} from "./InspectorPrimitives";
import { StoragePanel, type CleanupFeedback } from "./StoragePanel";
import {
  statusClass,
  statusLabel,
  syncStatusAriaLabel,
  syncStatusClass,
  syncStatusVisual,
} from "./presentation";
import { fill, formatBytes } from "../../shared/format";

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
    action: ProjectAction,
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
  const protocol = inspectedProject.protocol;
  const coreCapabilities = protocol.capabilities.filter(
    (capability) => capability.id !== "cleanup",
  );
  const protocolReady =
    protocol.manifestStatus === "configured" &&
    coreCapabilities.length > 0 &&
    coreCapabilities.every((capability) => capability.status === "configured");
  const canExecuteProfiles =
    inspectedProject.configuration.status === "configured";
  const showConfigurationGuidance =
    !canExecuteProfiles || buildProfiles.length === 0;
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
        {inspectedProject.links.length ? (
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

      <ProjectProtocolSection
        project={project}
        inspectedProject={inspectedProject}
        guidanceMessage={guidanceMessage}
        agentPrompt={agentPrompt}
        isAgentPromptCopied={isAgentPromptCopied}
        onCopyAgentPrompt={onCopyAgentPrompt}
        isWritingGuidance={isWritingGuidance}
        onGenerateGuidance={onGenerateGuidance}
      />

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

      <ProjectCommandsSection
        project={inspectedProject}
        isLoading={isLoading}
        activeRun={activeRun}
        onRun={onRun}
        rawCommandsRevealed={rawCommandsRevealed}
        onRevealRawCommands={() => setRawCommandsRevealedFor(project.id)}
      />

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
