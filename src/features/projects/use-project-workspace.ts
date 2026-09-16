import { useCallback, useState } from "react";
import type { ProjectSnapshot, WorkspaceSnapshot } from "../../bridge";
import type { Language } from "../../i18n";
import type { WorkspaceMessage } from "../../shared/activity";
import { useProjectSelection } from "./use-project-selection";
import {
  useWorkspaceScanLifecycle,
  type WorkspacePreferences,
} from "./use-workspace-scan-lifecycle";

export type { WorkspacePreferences } from "./use-workspace-scan-lifecycle";

export interface UseProjectWorkspaceOptions {
  nativeRuntime: boolean;
  preferences: WorkspacePreferences;
  initialRootPath: string;
  initialWorkspacePaths: string[];
  initialSnapshot: WorkspaceSnapshot;
  excludeNames: string[];
  language: Language;
  onError: (message: string | null) => void;
  onMessage: (message: WorkspaceMessage) => void;
  onProjectSelected: () => void;
  onSnapshotApplied: (snapshot: WorkspaceSnapshot) => void;
}

export interface UseProjectWorkspaceResult {
  rootPath: string;
  workspacePaths: string[];
  snapshot: WorkspaceSnapshot;
  selectedProjectId: string;
  selectedProject?: ProjectSnapshot;
  inspectorProject?: ProjectSnapshot;
  isLoadingDetails: boolean;
  isScanning: boolean;
  refreshingProjectId: string | null;
  updateInspectorProject: (
    updater: (
      current: ProjectSnapshot | undefined,
    ) => ProjectSnapshot | undefined,
  ) => void;
  updateWorkspacePaths: (nextPaths: string[]) => void;
  selectProject: (projectId: string) => void;
  scanWorkspace: () => Promise<void>;
  refreshProject: (project: ProjectSnapshot) => Promise<void>;
}

export function useProjectWorkspace({
  nativeRuntime,
  preferences,
  initialRootPath,
  initialWorkspacePaths,
  initialSnapshot,
  excludeNames,
  language,
  onError,
  onMessage,
  onProjectSelected,
  onSnapshotApplied,
}: UseProjectWorkspaceOptions): UseProjectWorkspaceResult {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>(initialSnapshot);

  const handleProjectRefreshed = useCallback(
    (project: ProjectSnapshot, details: ProjectSnapshot) => {
      setSnapshot((current) => ({
        ...current,
        projects: current.projects.map((candidate) =>
          candidate.id === project.id ? details : candidate,
        ),
        scannedAt: details.scannedAt,
      }));
    },
    [],
  );

  const selection = useProjectSelection({
    nativeRuntime,
    projects: snapshot.projects,
    initialProject: initialSnapshot.projects[0],
    onError,
    onMessage,
    onProjectSelected,
    onProjectRefreshed: handleProjectRefreshed,
  });

  const { clearSelection, getSelectedProjectId, selectProject } = selection;

  const applyWorkspaceSnapshot = useCallback(
    (nextSnapshot: WorkspaceSnapshot) => {
      const currentProjectId = getSelectedProjectId();
      const nextProjectId = nextSnapshot.projects.some(
        (project) => project.id === currentProjectId,
      )
        ? currentProjectId
        : (nextSnapshot.projects[0]?.id ?? "");

      setSnapshot(nextSnapshot);
      onSnapshotApplied(nextSnapshot);
      if (nextProjectId !== currentProjectId) {
        if (nextProjectId) {
          selectProject(nextProjectId);
        } else {
          clearSelection();
        }
      }
    },
    [clearSelection, getSelectedProjectId, onSnapshotApplied, selectProject],
  );

  const handleSnapshotTimestamp = useCallback((scannedAt: number) => {
    setSnapshot((current) => ({ ...current, scannedAt }));
  }, []);

  const {
    rootPath,
    workspacePaths,
    isScanning,
    updateWorkspacePaths,
    scanWorkspace,
  } = useWorkspaceScanLifecycle({
    nativeRuntime,
    preferences,
    initialRootPath,
    initialWorkspacePaths,
    initialSnapshot,
    snapshot,
    excludeNames,
    language,
    onError,
    onMessage,
    onApplySnapshot: applyWorkspaceSnapshot,
    onSnapshotTimestamp: handleSnapshotTimestamp,
  });

  return {
    rootPath,
    workspacePaths,
    snapshot,
    selectedProjectId: selection.selectedProjectId,
    selectedProject: selection.selectedProject,
    inspectorProject: selection.inspectorProject,
    isLoadingDetails: selection.isLoadingDetails,
    isScanning,
    refreshingProjectId: selection.refreshingProjectId,
    updateInspectorProject: selection.updateInspectorProject,
    updateWorkspacePaths,
    selectProject,
    scanWorkspace,
    refreshProject: selection.refreshProject,
  };
}
