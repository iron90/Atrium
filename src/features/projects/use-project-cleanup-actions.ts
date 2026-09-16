import { useCallback, useState } from "react";
import { bridge } from "../../bridge";
import type { ProjectSnapshot, ProjectStorage } from "../../bridge";
import { translate, type Language } from "../../i18n";
import { errorMessage } from "../../shared/errors";

export interface CleanupFeedback {
  removedBytes: number;
  failedCount: number;
}

export interface ProjectCleanupActions {
  cleanupFeedback: CleanupFeedback | null;
  cleanupSelection: string[];
  setCleanupSelection: (paths: string[]) => void;
  isCleaningArtifacts: boolean;
  reset: () => void;
  cleanArtifacts: (project: ProjectSnapshot) => Promise<void>;
}

export interface UseProjectCleanupActionsOptions {
  language: Language;
  inspectorProject?: ProjectSnapshot;
  onError: (message: string | null) => void;
  updateInspectorProject: (
    updater: (
      current: ProjectSnapshot | undefined,
    ) => ProjectSnapshot | undefined,
  ) => void;
}

export const cleanupPathsForProject = (
  storage: ProjectStorage | null | undefined,
  selectedPaths: string[],
): string[] =>
  selectedPaths.length
    ? selectedPaths
    : (storage?.entries.map((entry) => entry.relativePath) ?? []);

export function useProjectCleanupActions({
  language,
  inspectorProject,
  onError,
  updateInspectorProject,
}: UseProjectCleanupActionsOptions): ProjectCleanupActions {
  const [cleanupFeedback, setCleanupFeedback] =
    useState<CleanupFeedback | null>(null);
  const [cleanupSelection, setCleanupSelection] = useState<string[]>([]);
  const [isCleaningArtifacts, setIsCleaningArtifacts] = useState(false);

  const reset = useCallback(() => {
    setCleanupFeedback(null);
    setCleanupSelection([]);
    setIsCleaningArtifacts(false);
  }, []);

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

  return {
    cleanupFeedback,
    cleanupSelection,
    setCleanupSelection,
    isCleaningArtifacts,
    reset,
    cleanArtifacts,
  };
}
