import { useCallback, useState } from "react";
import { bridge } from "../../bridge";
import type {
  CleanupProgress,
  ProjectSnapshot,
  ProjectStorage,
} from "../../bridge";
import { subscribeToCleanupProgress } from "../../bridge/events";
import { errorMessage } from "../../shared/errors";

export interface CleanupFeedback {
  removedBytes: number;
  failedCount: number;
}

export interface ProjectCleanupActions {
  cleanupFeedback: CleanupFeedback | null;
  cleanupSelection: string[];
  cleanupConfirmation: string[] | null;
  cleanupProgress: CleanupProgress | null;
  setCleanupSelection: (paths: string[]) => void;
  isCleaningArtifacts: boolean;
  reset: () => void;
  cleanArtifacts: (project: ProjectSnapshot) => void;
  cancelCleanup: () => void;
  confirmCleanup: () => Promise<void>;
}

export interface UseProjectCleanupActionsOptions {
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
  inspectorProject,
  onError,
  updateInspectorProject,
}: UseProjectCleanupActionsOptions): ProjectCleanupActions {
  const [cleanupFeedback, setCleanupFeedback] =
    useState<CleanupFeedback | null>(null);
  const [cleanupSelection, setCleanupSelection] = useState<string[]>([]);
  const [pendingCleanup, setPendingCleanup] = useState<{
    project: ProjectSnapshot;
    selectedPaths: string[];
  } | null>(null);
  const [cleanupProgress, setCleanupProgress] =
    useState<CleanupProgress | null>(null);
  const [isCleaningArtifacts, setIsCleaningArtifacts] = useState(false);

  const reset = useCallback(() => {
    setCleanupFeedback(null);
    setCleanupSelection([]);
    setPendingCleanup(null);
    setCleanupProgress(null);
    setIsCleaningArtifacts(false);
  }, []);

  const cleanArtifacts = useCallback(
    (project: ProjectSnapshot) => {
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
      setCleanupFeedback(null);
      onError(null);
      setPendingCleanup({ project, selectedPaths });
    },
    [cleanupSelection, inspectorProject, isCleaningArtifacts, onError],
  );

  const cancelCleanup = useCallback(() => {
    setPendingCleanup(null);
  }, []);

  const confirmCleanup = useCallback(async () => {
    if (!pendingCleanup || isCleaningArtifacts) return;

    const { project, selectedPaths } = pendingCleanup;
    setPendingCleanup(null);
    setIsCleaningArtifacts(true);
    setCleanupProgress({
      phase: "preparing",
      relativePath: null,
      completedBytes: 0,
      totalBytes: 0,
      completedFiles: 0,
      totalFiles: 0,
      percent: 0,
    });
    setCleanupFeedback(null);
    onError(null);
    let unsubscribe: (() => void) | undefined;
    try {
      try {
        unsubscribe = await subscribeToCleanupProgress(setCleanupProgress);
      } catch {
        // Cleanup remains available if the optional progress channel fails.
      }
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
      unsubscribe?.();
      setIsCleaningArtifacts(false);
      setCleanupProgress(null);
    }
  }, [isCleaningArtifacts, onError, pendingCleanup, updateInspectorProject]);

  return {
    cleanupFeedback,
    cleanupSelection,
    cleanupConfirmation: pendingCleanup?.selectedPaths ?? null,
    cleanupProgress,
    setCleanupSelection,
    isCleaningArtifacts,
    reset,
    cleanArtifacts,
    cancelCleanup,
    confirmCleanup,
  };
}
