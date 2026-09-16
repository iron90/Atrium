import { useCallback } from "react";
import type { ProjectSnapshot } from "../../bridge";
import {
  useProjectCleanupActions,
  type CleanupFeedback,
} from "./use-project-cleanup-actions";
import { useProjectGuidanceActions } from "./use-project-guidance-actions";
import type { Language } from "../../i18n";

export type { CleanupFeedback } from "./use-project-cleanup-actions";
export { cleanupPathsForProject } from "./use-project-cleanup-actions";

export interface ProjectInspectorActionsOptions {
  language: Language;
  inspectorProject?: ProjectSnapshot;
  onError: (message: string | null) => void;
  updateInspectorProject: (
    updater: (
      current: ProjectSnapshot | undefined,
    ) => ProjectSnapshot | undefined,
  ) => void;
}

export interface ProjectInspectorActions {
  reset: () => void;
  guidanceMessage: string | null;
  agentPrompt: string | null;
  isAgentPromptCopied: boolean;
  isWritingGuidance: boolean;
  cleanupFeedback: CleanupFeedback | null;
  cleanupSelection: string[];
  setCleanupSelection: (paths: string[]) => void;
  isCleaningArtifacts: boolean;
  generateGuidance: (project: ProjectSnapshot) => Promise<void>;
  cleanArtifacts: (project: ProjectSnapshot) => Promise<void>;
  copyAgentPrompt: () => Promise<void>;
}

export function useProjectInspectorActions({
  language,
  inspectorProject,
  onError,
  updateInspectorProject,
}: ProjectInspectorActionsOptions): ProjectInspectorActions {
  const {
    guidanceMessage,
    agentPrompt,
    isAgentPromptCopied,
    isWritingGuidance,
    reset: resetGuidance,
    generateGuidance,
    copyAgentPrompt,
  } = useProjectGuidanceActions({ language, onError });
  const {
    cleanupFeedback,
    cleanupSelection,
    setCleanupSelection,
    isCleaningArtifacts,
    reset: resetCleanup,
    cleanArtifacts,
  } = useProjectCleanupActions({
    language,
    inspectorProject,
    onError,
    updateInspectorProject,
  });

  const reset = useCallback(() => {
    resetGuidance();
    resetCleanup();
  }, [resetCleanup, resetGuidance]);

  return {
    reset,
    guidanceMessage,
    agentPrompt,
    isAgentPromptCopied,
    isWritingGuidance,
    cleanupFeedback,
    cleanupSelection,
    setCleanupSelection,
    isCleaningArtifacts,
    generateGuidance,
    cleanArtifacts,
    copyAgentPrompt,
  };
}
