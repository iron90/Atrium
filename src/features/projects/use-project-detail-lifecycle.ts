import { useCallback, useEffect, useRef, useState } from "react";
import { bridge } from "../../bridge";
import type { ProjectSnapshot } from "../../bridge";
import { errorMessage } from "../../shared/errors";

export interface ProjectDetailLifecycleState {
  inspectorProject?: ProjectSnapshot;
  isLoadingDetails: boolean;
  resetForSelection: () => void;
  clearDetails: () => void;
  updateInspectorProject: (
    updater: (
      current: ProjectSnapshot | undefined,
    ) => ProjectSnapshot | undefined,
  ) => void;
  refreshProject: (project: ProjectSnapshot) => Promise<void>;
}

export interface UseProjectDetailLifecycleOptions {
  nativeRuntime: boolean;
  projects: ProjectSnapshot[];
  selectedProjectId: string;
  initialProject?: ProjectSnapshot;
  onError: (message: string | null) => void;
  onMessage: (message: { type: "projectRefreshed" }) => void;
  onProjectRefreshed: (
    project: ProjectSnapshot,
    details: ProjectSnapshot,
  ) => void;
  inspectProject?: (projectPath: string) => Promise<ProjectSnapshot>;
}

export function useProjectDetailLifecycle({
  nativeRuntime,
  projects,
  selectedProjectId,
  initialProject,
  onError,
  onMessage,
  onProjectRefreshed,
  inspectProject = bridge.inspectProject,
}: UseProjectDetailLifecycleOptions): ProjectDetailLifecycleState & {
  refreshingProjectId: string | null;
} {
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

  useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId;
  }, [selectedProjectId]);

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
            onError(errorMessage(detailError));
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

  const resetForSelection = useCallback(() => {
    detailRequest.current += 1;
    setInspectorProject(undefined);
    setIsLoadingDetails(true);
  }, []);

  const clearDetails = useCallback(() => {
    detailRequest.current += 1;
    setInspectorProject(undefined);
    setIsLoadingDetails(false);
  }, []);

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
        onError(errorMessage(refreshError));
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

  return {
    inspectorProject,
    isLoadingDetails,
    refreshingProjectId,
    resetForSelection,
    clearDetails,
    updateInspectorProject,
    refreshProject,
  };
}
