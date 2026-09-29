import { useState } from "react";
import type {
  CleanupProgress,
  ProfileAction,
  ProjectCommand,
  ProjectSnapshot,
} from "../../bridge";
import { useGitBranchOverview } from "../git/use-git-branch-overview";
import { useI18n } from "../../i18n";
import { ProjectBuildProfilesSection } from "./ProjectBuildProfilesSection";
import { ProjectCommandsSection } from "./ProjectCommandsSection";
import { ProjectCommitsSection } from "./ProjectCommitsSection";
import { ProjectContextSection } from "./ProjectContextSection";
import { ProjectInspectorHeader } from "./ProjectInspectorHeader";
import { ProjectProtocolSection } from "./ProjectProtocolSection";
import { ProjectRepositorySection } from "./ProjectRepositorySection";
import { ProjectRunHistorySection } from "./ProjectRunHistorySection";
import { ProjectRunSection } from "./ProjectRunSection";
import { ProjectStorageSection } from "./ProjectStorageSection";
import type { ProjectAction } from "./project-actions";
import type { FinishedRunRecord } from "../runs/use-run-event-stream";
import type { CleanupFeedback } from "./StoragePanel";
import { protocolViewModel } from "./protocol-presentation";

export interface ProjectInspectorProps {
  project?: ProjectSnapshot;
  details?: ProjectSnapshot;
  isLoading: boolean;
  lastFinishedRun?: FinishedRunRecord;
  runHistoryRefreshToken?: number;
  onRunHistoryError?: (message: string | null) => void;
  onRun: (
    command: ProjectCommand,
    profileId?: string,
    profileAction?: ProfileAction,
  ) => void;
  onRefreshProject: (project: ProjectSnapshot) => void;
  isRefreshing: boolean;
  onStop: () => void;
  onGenerateGuidance: (project: ProjectSnapshot) => void;
  agentPrompt: string | null;
  isAgentPromptForGuidanceUpdate: boolean;
  isAgentPromptCopied: boolean;
  onCopyAgentPrompt: () => void;
  isWritingGuidance: boolean;
  cleanupFeedback: CleanupFeedback | null;
  cleanupSelection: string[];
  cleanupConfirmation: string[] | null;
  cleanupProgress: CleanupProgress | null;
  onCleanupSelectionChange: (paths: string[]) => void;
  isCleaningArtifacts: boolean;
  onCleanArtifacts: (project: ProjectSnapshot) => void;
  onCancelCleanup: () => void;
  onConfirmCleanup: () => void;
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
  lastFinishedRun,
  runHistoryRefreshToken,
  onRunHistoryError,
  onRun,
  onRefreshProject,
  isRefreshing,
  onStop,
  onGenerateGuidance,
  agentPrompt,
  isAgentPromptForGuidanceUpdate,
  isAgentPromptCopied,
  onCopyAgentPrompt,
  isWritingGuidance,
  cleanupFeedback,
  cleanupSelection,
  cleanupConfirmation,
  cleanupProgress,
  onCleanupSelectionChange,
  isCleaningArtifacts,
  onCleanArtifacts,
  onCancelCleanup,
  onConfirmCleanup,
  onOpenArtifact,
  onOpenProjectAction,
}: ProjectInspectorProps) {
  const { t } = useI18n();
  const [rawCommandsRevealedFor, setRawCommandsRevealedFor] = useState<
    string | null
  >(null);
  const [branchViewFor, setBranchViewFor] = useState<{
    projectId: string;
    branch: string;
  } | null>(null);

  // Branch selection is inspector view state, keyed per project so switching
  // projects returns the view to the checked-out HEAD.
  const selectedBranch =
    branchViewFor && branchViewFor.projectId === project?.id
      ? branchViewFor.branch
      : null;
  const branchOverview = useGitBranchOverview(project, selectedBranch);

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
  const protocolReady = protocolViewModel(inspectedProject).isReady;

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
        selectedBranch={selectedBranch}
        onSelectBranch={(branch) =>
          setBranchViewFor(
            branch === null ? null : { projectId: project.id, branch },
          )
        }
        branchOverview={branchOverview.overview}
        branchOverviewLoading={branchOverview.isLoading}
        branchOverviewError={branchOverview.error}
        onOpenProjectAction={onOpenProjectAction}
      />
      <ProjectProtocolSection
        project={project}
        inspectedProject={inspectedProject}
        agentPrompt={agentPrompt}
        isAgentPromptForGuidanceUpdate={isAgentPromptForGuidanceUpdate}
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
        cleanupConfirmation={cleanupConfirmation}
        cleanupProgress={cleanupProgress}
        onCleanupSelectionChange={onCleanupSelectionChange}
        isCleaningArtifacts={isCleaningArtifacts}
        onCleanArtifacts={onCleanArtifacts}
        onCancelCleanup={onCancelCleanup}
        onConfirmCleanup={onConfirmCleanup}
      />
      <ProjectContextSection
        project={inspectedProject}
        protocolReady={protocolReady}
      />
      <ProjectBuildProfilesSection
        project={inspectedProject}
        protocolReady={protocolReady}
        onRun={onRun}
        onOpenArtifact={onOpenArtifact}
      />
      <ProjectCommandsSection
        project={inspectedProject}
        isLoading={isLoading}
        onRun={onRun}
        rawCommandsRevealed={rawCommandsRevealed}
        onRevealRawCommands={() => setRawCommandsRevealedFor(project.id)}
      />
      <ProjectRunSection lastFinishedRun={lastFinishedRun} onStop={onStop} />
      <ProjectRunHistorySection
        project={project}
        refreshToken={runHistoryRefreshToken}
        onError={onRunHistoryError}
      />
      <ProjectCommitsSection
        project={inspectedProject}
        isLoading={isLoading}
        selectedBranch={selectedBranch}
        branchOverview={branchOverview.overview}
        branchOverviewLoading={branchOverview.isLoading}
        branchOverviewError={branchOverview.error}
      />
    </aside>
  );
}
