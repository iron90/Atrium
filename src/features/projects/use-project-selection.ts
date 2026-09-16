import { useCallback, useMemo, useRef, useState } from "react";
import { bridge } from "../../bridge";
import type { ProjectSnapshot } from "../../bridge";
import { useProjectDetailLifecycle } from "./use-project-detail-lifecycle";

export interface ProjectSelectionState {
  selectedProjectId: string;
  selectedProject?: ProjectSnapshot;
  inspectorProject?: ProjectSnapshot;
  isLoadingDetails: boolean;
  refreshingProjectId: string | null;
  selectProject: (projectId: string) => void;
  clearSelection: () => void;
  getSelectedProjectId: () => string;
  updateInspectorProject: (
    updater: (
      current: ProjectSnapshot | undefined,
    ) => ProjectSnapshot | undefined,
  ) => void;
  refreshProject: (project: ProjectSnapshot) => Promise<void>;
}

export function useProjectSelection({
  nativeRuntime,
  projects,
  initialProject,
  onError,
  onMessage,
  onProjectSelected,
  onProjectRefreshed,
  inspectProject = bridge.inspectProject,
}: {
  nativeRuntime: boolean;
  projects: ProjectSnapshot[];
  initialProject?: ProjectSnapshot;
  onError: (message: string | null) => void;
  onMessage: (message: { type: "projectRefreshed" }) => void;
  onProjectSelected: () => void;
  onProjectRefreshed: (
    project: ProjectSnapshot,
    details: ProjectSnapshot,
  ) => void;
  inspectProject?: (projectPath: string) => Promise<ProjectSnapshot>;
}): ProjectSelectionState {
  const [selectedProjectId, setSelectedProjectId] = useState(
    projects[0]?.id ?? "",
  );
  const selectedProjectIdRef = useRef(selectedProjectId);
  const {
    inspectorProject,
    isLoadingDetails,
    refreshingProjectId,
    resetForSelection,
    clearDetails,
    updateInspectorProject,
    refreshProject,
  } = useProjectDetailLifecycle({
    nativeRuntime,
    projects,
    selectedProjectId,
    initialProject,
    onError,
    onMessage,
    onProjectRefreshed,
    inspectProject,
  });

  const selectProject = useCallback(
    (projectId: string) => {
      selectedProjectIdRef.current = projectId;
      setSelectedProjectId(projectId);
      resetForSelection();
      onProjectSelected();
    },
    [onProjectSelected, resetForSelection],
  );

  const clearSelection = useCallback(() => {
    selectedProjectIdRef.current = "";
    setSelectedProjectId("");
    clearDetails();
  }, [clearDetails]);

  const getSelectedProjectId = useCallback(
    () => selectedProjectIdRef.current,
    [],
  );

  const selectedProject = useMemo(
    () =>
      projects.find((project) => project.id === selectedProjectId) ??
      projects[0],
    [projects, selectedProjectId],
  );

  return {
    selectedProjectId,
    selectedProject,
    inspectorProject,
    isLoadingDetails,
    refreshingProjectId,
    selectProject,
    clearSelection,
    getSelectedProjectId,
    updateInspectorProject,
    refreshProject,
  };
}
