import { useCallback, useEffect } from "react";
import type { CleanupProgress, ProjectSnapshot } from "../../bridge";
import { protocolViewModel } from "./protocol-presentation";
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
  agentPrompt: string | null;
  isAgentPromptForGuidanceUpdate: boolean;
  isAgentPromptCopied: boolean;
  isWritingGuidance: boolean;
  cleanupFeedback: CleanupFeedback | null;
  cleanupSelection: string[];
  cleanupConfirmation: string[] | null;
  cleanupProgress: CleanupProgress | null;
  setCleanupSelection: (paths: string[]) => void;
  isCleaningArtifacts: boolean;
  generateGuidance: (project: ProjectSnapshot) => Promise<void>;
  dismissAgentPrompt: () => void;
  cleanArtifacts: (project: ProjectSnapshot) => void;
  cancelCleanup: () => void;
  confirmCleanup: () => Promise<void>;
  copyAgentPrompt: () => Promise<void>;
}

export function useProjectInspectorActions({
  language,
  inspectorProject,
  onError,
  updateInspectorProject,
}: ProjectInspectorActionsOptions): ProjectInspectorActions {
  const {
    agentPrompt,
    isAgentPromptForGuidanceUpdate,
    isAgentPromptCopied,
    isWritingGuidance,
    reset: resetGuidance,
    dismissAgentPrompt,
    generateGuidance,
    copyAgentPrompt,
  } = useProjectGuidanceActions({ language, onError });
  const {
    cleanupFeedback,
    cleanupSelection,
    cleanupConfirmation,
    cleanupProgress,
    setCleanupSelection,
    isCleaningArtifacts,
    reset: resetCleanup,
    cleanArtifacts,
    cancelCleanup,
    confirmCleanup,
  } = useProjectCleanupActions({
    inspectorProject,
    onError,
    updateInspectorProject,
  });

  const reset = useCallback(() => {
    resetGuidance();
    resetCleanup();
  }, [resetCleanup, resetGuidance]);

  useEffect(() => {
    if (!inspectorProject || isAgentPromptForGuidanceUpdate) return;
    if (!protocolViewModel(inspectorProject).needsGuidance) resetGuidance();
  }, [inspectorProject, isAgentPromptForGuidanceUpdate, resetGuidance]);

  return {
    reset,
    agentPrompt,
    isAgentPromptForGuidanceUpdate,
    isAgentPromptCopied,
    isWritingGuidance,
    cleanupFeedback,
    cleanupSelection,
    cleanupConfirmation,
    cleanupProgress,
    setCleanupSelection,
    isCleaningArtifacts,
    generateGuidance,
    dismissAgentPrompt,
    cleanArtifacts,
    cancelCleanup,
    confirmCleanup,
    copyAgentPrompt,
  };
}
