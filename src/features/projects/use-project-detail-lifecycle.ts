import { useCallback, useEffect, useRef, useState } from "react";
import { bridge } from "../../bridge";
import type { ProjectSnapshot } from "../../bridge";
import { errorMessage } from "../../shared/errors";
import {
  SCAN_TIMEOUT_MESSAGE,
  SCAN_TIMEOUT_MS,
  withTimeout,
} from "../../shared/with-timeout";

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
  const selectedProject = projects.find(
    (candidate) => candidate.id === selectedProjectId,
  );
  const selectedProjectRef = useRef(selectedProject);

  useEffect(() => {
    selectedProjectRef.current = selectedProject;
  }, [selectedProject]);

  useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId;
  }, [selectedProjectId]);

  // Workspace refreshes are lightweight. Protocol and repository fact changes
  // are merged by the workspace hook; only selection and explicit refreshes
  // should start the storage/artifact inspection.
  useEffect(() => {
    const project = selectedProjectRef.current;
    if (!project) return undefined;

    let disposed = false;
    const requestId = ++detailRequest.current;
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
  }, [inspectProject, onError, selectedProjectId]);

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
        const details = await withTimeout(
          inspectProject(project.path),
          SCAN_TIMEOUT_MS,
          SCAN_TIMEOUT_MESSAGE,
        );
        onProjectRefreshed(project, details);
        const isStillSelected = selectedProjectIdRef.current === project.id;
        if (isStillSelected) {
          setInspectorProject(details);
          setIsLoadingDetails(false);
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
