import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bridge } from "../../bridge";
import type { ProjectSnapshot } from "../../bridge";

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
  const [inspectorProject, setInspectorProject] = useState<
    ProjectSnapshot | undefined
  >(() => (nativeRuntime ? undefined : initialProject));
  const [isLoadingDetails, setIsLoadingDetails] = useState(nativeRuntime);
  const [refreshingProjectId, setRefreshingProjectId] = useState<string | null>(
    null,
  );
  const detailRequest = useRef(0);
  const selectedProjectIdRef = useRef(selectedProjectId);
  const skipNextDetailRequest = useRef<string | null>(null);

  const selectProject = useCallback(
    (projectId: string) => {
      selectedProjectIdRef.current = projectId;
      setSelectedProjectId(projectId);
      setInspectorProject(undefined);
      setIsLoadingDetails(true);
      onProjectSelected();
    },
    [onProjectSelected],
  );

  const clearSelection = useCallback(() => {
    selectedProjectIdRef.current = "";
    setSelectedProjectId("");
    setInspectorProject(undefined);
    setIsLoadingDetails(false);
  }, []);

  const getSelectedProjectId = useCallback(
    () => selectedProjectIdRef.current,
    [],
  );

  useEffect(() => {
    const project = projects.find(
      (candidate) => candidate.id === selectedProjectId,
    );
    if (!project) return undefined;

    let disposed = false;
    const requestId = ++detailRequest.current;
    if (skipNextDetailRequest.current === project.id) {
      skipNextDetailRequest.current = null;
      return undefined;
    }
    const timer = window.setTimeout(() => {
      if (disposed) return;
      setInspectorProject(undefined);
      setIsLoadingDetails(true);
      void inspectProject(project.path)
        .then((details) => {
          if (!disposed && requestId === detailRequest.current) {
            setInspectorProject(details);
          }
        })
        .catch((detailError) => {
          if (!disposed && requestId === detailRequest.current) {
            onError(
              detailError instanceof Error
                ? detailError.message
                : String(detailError),
            );
            setInspectorProject(project);
          }
        })
        .finally(() => {
          if (!disposed && requestId === detailRequest.current) {
            setIsLoadingDetails(false);
          }
        });
    }, 0);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [inspectProject, onError, projects, selectedProjectId]);

  const refreshProject = useCallback(
    async (project: ProjectSnapshot) => {
      if (refreshingProjectId) return;
      setRefreshingProjectId(project.id);
      onError(null);
      detailRequest.current += 1;
      try {
        const details = await inspectProject(project.path);
        onProjectRefreshed(project, details);
        const isStillSelected = selectedProjectIdRef.current === project.id;
        if (isStillSelected) {
          skipNextDetailRequest.current = project.id;
          setInspectorProject(details);
          setIsLoadingDetails(false);
          onMessage({ type: "projectRefreshed" });
        }
      } catch (refreshError) {
        onError(
          refreshError instanceof Error
            ? refreshError.message
            : String(refreshError),
        );
      } finally {
        setRefreshingProjectId(null);
      }
    },
    [
      inspectProject,
      onError,
      onMessage,
      onProjectRefreshed,
      refreshingProjectId,
    ],
  );

  const updateInspectorProject = useCallback(
    (
      updater: (
        current: ProjectSnapshot | undefined,
      ) => ProjectSnapshot | undefined,
    ) => {
      setInspectorProject(updater);
    },
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
