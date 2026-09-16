import { useState } from "react";
import type {
  ProfileAction,
  ProjectCommand,
  ProjectSnapshot,
  RunStarted,
} from "../../bridge";
import { useI18n } from "../../i18n";
import { ProjectBuildProfilesSection } from "./ProjectBuildProfilesSection";
import { ProjectCommandsSection } from "./ProjectCommandsSection";
import { ProjectCommitsSection } from "./ProjectCommitsSection";
import { ProjectContextSection } from "./ProjectContextSection";
import { ProjectInspectorHeader } from "./ProjectInspectorHeader";
import { ProjectProtocolSection } from "./ProjectProtocolSection";
import { ProjectRepositorySection } from "./ProjectRepositorySection";
import { ProjectRunSection } from "./ProjectRunSection";
import { ProjectStorageSection } from "./ProjectStorageSection";
import { ProjectToolsSection } from "./ProjectToolsSection";
import type { ProjectAction } from "./project-actions";
import type { CleanupFeedback } from "./StoragePanel";

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
  const { t } = useI18n();
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
  const protocol = inspectedProject.protocol;
  const coreCapabilities = protocol.capabilities.filter(
    (capability) => capability.id !== "cleanup",
  );
  const protocolReady =
    protocol.manifestStatus === "configured" &&
    coreCapabilities.length > 0 &&
    coreCapabilities.every((capability) => capability.status === "configured");

  return (
    <aside className="inspector">
      <ProjectInspectorHeader
        project={project}
        isRefreshing={isRefreshing}
        onRefreshProject={onRefreshProject}
      />
      <ProjectRepositorySection
        project={project}
        inspectedProject={inspectedProject}
        isLoading={isLoading}
      />
      <ProjectToolsSection
        project={inspectedProject}
        onOpenProjectAction={onOpenProjectAction}
      />
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
      <ProjectStorageSection
        project={project}
        inspectedProject={inspectedProject}
        isLoading={isLoading}
        cleanupFeedback={cleanupFeedback}
        cleanupSelection={cleanupSelection}
        onCleanupSelectionChange={onCleanupSelectionChange}
        isCleaningArtifacts={isCleaningArtifacts}
        onCleanArtifacts={onCleanArtifacts}
      />
      <ProjectContextSection
        project={inspectedProject}
        protocolReady={protocolReady}
      />
      <ProjectBuildProfilesSection
        project={inspectedProject}
        protocolReady={protocolReady}
        activeRun={activeRun}
        onRun={onRun}
        onOpenArtifact={onOpenArtifact}
      />
      <ProjectCommandsSection
        project={inspectedProject}
        isLoading={isLoading}
        activeRun={activeRun}
        onRun={onRun}
        rawCommandsRevealed={rawCommandsRevealed}
        onRevealRawCommands={() => setRawCommandsRevealedFor(project.id)}
      />
      <ProjectRunSection
        activeRun={activeRun}
        outputLines={outputLines}
        onStop={onStop}
      />
      <ProjectCommitsSection project={inspectedProject} isLoading={isLoading} />
      <div className="inspector-footnote">
        <span className="fact-key" /> {t("detectedFacts")}
      </div>
    </aside>
  );
}
