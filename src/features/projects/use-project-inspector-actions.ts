import { useCallback, useState } from "react";
import { bridge } from "../../bridge";
import type { ProjectSnapshot, ProjectStorage } from "../../bridge";
import { createConfigurationAgentPrompt } from "./guidance-prompt";
import { translate, type Language } from "../../i18n";
import { fill } from "../../shared/format";

export interface CleanupFeedback {
  removedBytes: number;
  failedCount: number;
}

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

export const cleanupPathsForProject = (
  storage: ProjectStorage | null | undefined,
  selectedPaths: string[],
): string[] =>
  selectedPaths.length
    ? selectedPaths
    : (storage?.entries.map((entry) => entry.relativePath) ?? []);

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function useProjectInspectorActions({
  language,
  inspectorProject,
  onError,
  updateInspectorProject,
}: ProjectInspectorActionsOptions): ProjectInspectorActions {
  const [guidanceMessage, setGuidanceMessage] = useState<string | null>(null);
  const [agentPrompt, setAgentPrompt] = useState<string | null>(null);
  const [isAgentPromptCopied, setIsAgentPromptCopied] = useState(false);
  const [isWritingGuidance, setIsWritingGuidance] = useState(false);
  const [cleanupFeedback, setCleanupFeedback] =
    useState<CleanupFeedback | null>(null);
  const [cleanupSelection, setCleanupSelection] = useState<string[]>([]);
  const [isCleaningArtifacts, setIsCleaningArtifacts] = useState(false);

  const reset = useCallback(() => {
    setGuidanceMessage(null);
    setAgentPrompt(null);
    setIsAgentPromptCopied(false);
    setCleanupFeedback(null);
    setCleanupSelection([]);
    setIsCleaningArtifacts(false);
  }, []);

  const generateGuidance = useCallback(
    async (project: ProjectSnapshot) => {
      setIsWritingGuidance(true);
      setGuidanceMessage(null);
      onError(null);
      try {
        const report = await bridge.generateProjectGuidance(project.path);
        setGuidanceMessage(
          fill(
            translate(language, "guidanceGenerated"),
            "path",
            report.paths.join(" · "),
          ),
        );
        setAgentPrompt(
          createConfigurationAgentPrompt(project, report.paths, language),
        );
        setIsAgentPromptCopied(false);
      } catch (error) {
        onError(errorMessage(error));
      } finally {
        setIsWritingGuidance(false);
      }
    },
    [language, onError],
  );

  const cleanArtifacts = useCallback(
    async (project: ProjectSnapshot) => {
      const storage =
        inspectorProject?.id === project.id
          ? inspectorProject.storage
          : undefined;
      const selectedPaths = cleanupPathsForProject(storage, cleanupSelection);
      if (
        !storage?.entries.length ||
        !selectedPaths.length ||
        isCleaningArtifacts
      ) {
        return;
      }
      if (!window.confirm(translate(language, "confirmCleanArtifacts"))) return;

      setIsCleaningArtifacts(true);
      setCleanupFeedback(null);
      onError(null);
      try {
        const result = await bridge.cleanProjectArtifacts(
          project.path,
          selectedPaths,
        );
        updateInspectorProject((current) =>
          current?.id === project.id
            ? { ...current, storage: result.storage }
            : current,
        );
        setCleanupFeedback({
          removedBytes: result.removedBytes,
          failedCount: result.failedEntries.length,
        });
        setCleanupSelection([]);
      } catch (error) {
        onError(errorMessage(error));
      } finally {
        setIsCleaningArtifacts(false);
      }
    },
    [
      cleanupSelection,
      inspectorProject,
      isCleaningArtifacts,
      language,
      onError,
      updateInspectorProject,
    ],
  );

  const copyAgentPrompt = useCallback(async () => {
    if (!agentPrompt) return;
    try {
      if (!navigator.clipboard) {
        throw new Error("Clipboard is unavailable in this session.");
      }
      await navigator.clipboard.writeText(agentPrompt);
      setIsAgentPromptCopied(true);
    } catch (error) {
      onError(errorMessage(error));
    }
  }, [agentPrompt, onError]);

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
