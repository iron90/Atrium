import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bridge } from "../../bridge";
import { translate, type Language } from "../../i18n";
import type { ProjectSnapshot, WorkspaceSnapshot } from "../../bridge/types";
import {
  emptySnapshot,
  mergeWorkspaceSnapshots,
  snapshotFingerprint,
} from "./model";

export type WorkspaceMessage =
  | { type: "projects"; count: number }
  | { type: "workspaceUpdated"; count: number }
  | { type: "refreshingWorkspace" }
  | { type: "scanning" }
  | { type: "projectRefreshed" }
  | {
      type: "localized";
      key: "scanFailed" | "refreshFailed";
    };

export interface WorkspacePreferences {
  rootPath?: string;
  workspaces?: string[];
}

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
  const [rootPath, setRootPath] = useState(initialRootPath);
  const [workspacePaths, setWorkspacePaths] = useState(initialWorkspacePaths);
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>(initialSnapshot);
  const [selectedProjectId, setSelectedProjectId] = useState(
    initialSnapshot.projects[0]?.id ?? "",
  );
  const [inspectorProject, setInspectorProject] = useState<
    ProjectSnapshot | undefined
  >(() => (nativeRuntime ? undefined : initialSnapshot.projects[0]));
  const [isLoadingDetails, setIsLoadingDetails] = useState(nativeRuntime);
  const [isScanning, setIsScanning] = useState(false);
  const [refreshingProjectId, setRefreshingProjectId] = useState<string | null>(
    null,
  );
  const detailRequest = useRef(0);
  const selectedProjectIdRef = useRef(selectedProjectId);
  const workspaceFingerprintRef = useRef(snapshotFingerprint(initialSnapshot));
  const workspaceScanInFlight = useRef(false);
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

  const applyWorkspaceSnapshot = useCallback(
    (nextSnapshot: WorkspaceSnapshot) => {
      const currentProjectId = selectedProjectIdRef.current;
      const nextProjectId = nextSnapshot.projects.some(
        (project) => project.id === currentProjectId,
      )
        ? currentProjectId
        : (nextSnapshot.projects[0]?.id ?? "");

      workspaceFingerprintRef.current = snapshotFingerprint(nextSnapshot);
      setSnapshot(nextSnapshot);
      onSnapshotApplied(nextSnapshot);
      if (nextProjectId !== currentProjectId) {
        if (nextProjectId) {
          selectProject(nextProjectId);
        } else {
          selectedProjectIdRef.current = "";
          setSelectedProjectId("");
          setInspectorProject(undefined);
          setIsLoadingDetails(false);
        }
      }
    },
    [onSnapshotApplied, selectProject],
  );

  const scanAllWorkspaces = useCallback(
    async (paths: string[]): Promise<WorkspaceSnapshot> => {
      const normalized = Array.from(
        new Set(paths.map((path) => path.trim()).filter(Boolean)),
      );
      if (!normalized.length) return emptySnapshot("");
      const results = await Promise.allSettled(
        normalized.map((path) => bridge.scanWorkspace(path, excludeNames)),
      );
      const snapshots = results
        .filter(
          (result): result is PromiseFulfilledResult<WorkspaceSnapshot> =>
            result.status === "fulfilled",
        )
        .map((result) => result.value);
      if (!snapshots.length) {
        const failure = results.find(
          (result): result is PromiseRejectedResult =>
            result.status === "rejected",
        );
        throw failure?.reason ?? new Error("No workspace could be scanned");
      }
      const scan = mergeWorkspaceSnapshots(snapshots, normalized[0] ?? "");
      const rejected = results
        .map((result, index) =>
          result.status === "rejected"
            ? `Workspace ${normalized[index] ?? ""}: ${String(result.reason)}`
            : null,
        )
        .filter((warning): warning is string => Boolean(warning));
      const overlap = normalized.some((left, index) =>
        normalized.some(
          (right, rightIndex) =>
            index !== rightIndex &&
            (right.startsWith(`${left}/`) || left.startsWith(`${right}/`)),
        ),
      );
      return {
        ...scan,
        warnings: [
          ...scan.warnings,
          ...rejected,
          ...(overlap ? [translate(language, "workspaceOverlap")] : []),
        ],
      };
    },
    [excludeNames, language],
  );

  useEffect(() => {
    if (!nativeRuntime) return undefined;

    let disposed = false;
    workspaceScanInFlight.current = true;
    void bridge
      .defaultWorkspacePath()
      .then((defaultPath) => {
        const nextRoot = preferences.rootPath?.trim() || defaultPath;
        if (!nextRoot) {
          throw new Error("No default workspace path is available.");
        }
        const nextPaths = preferences.workspaces?.length
          ? preferences.workspaces
          : [nextRoot];
        if (!disposed) {
          setRootPath(nextPaths[0] ?? nextRoot);
          setWorkspacePaths(nextPaths);
        }
        return scanAllWorkspaces(nextPaths);
      })
      .then((nextSnapshot) => {
        if (disposed) return;
        applyWorkspaceSnapshot(nextSnapshot);
        onMessage({ type: "projects", count: nextSnapshot.projects.length });
      })
      .catch((scanError) => {
        if (disposed) return;
        onError(
          scanError instanceof Error ? scanError.message : String(scanError),
        );
        onMessage({ type: "localized", key: "scanFailed" });
      })
      .finally(() => {
        workspaceScanInFlight.current = false;
      });

    return () => {
      disposed = true;
    };
  }, [
    applyWorkspaceSnapshot,
    nativeRuntime,
    onError,
    onMessage,
    preferences.rootPath,
    preferences.workspaces,
    scanAllWorkspaces,
  ]);

  useEffect(() => {
    if (!nativeRuntime || !workspacePaths.some((path) => path.trim()))
      return undefined;

    let disposed = false;
    const refreshWorkspace = async () => {
      if (disposed || workspaceScanInFlight.current) return;
      workspaceScanInFlight.current = true;
      onMessage({ type: "refreshingWorkspace" });
      try {
        const nextSnapshot = await scanAllWorkspaces(workspacePaths);
        if (disposed) return;
        const changed =
          workspaceFingerprintRef.current !== snapshotFingerprint(nextSnapshot);
        if (changed) {
          applyWorkspaceSnapshot(nextSnapshot);
          onError(null);
          onMessage({
            type: "workspaceUpdated",
            count: nextSnapshot.projects.length,
          });
        } else {
          setSnapshot((current) => ({
            ...current,
            scannedAt: nextSnapshot.scannedAt,
          }));
          onMessage({
            type: "projects",
            count: nextSnapshot.projects.length,
          });
        }
      } catch {
        if (!disposed) onMessage({ type: "localized", key: "refreshFailed" });
      } finally {
        workspaceScanInFlight.current = false;
      }
    };

    const interval = window.setInterval(() => void refreshWorkspace(), 10_000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [
    applyWorkspaceSnapshot,
    nativeRuntime,
    onError,
    onMessage,
    scanAllWorkspaces,
    workspacePaths,
  ]);

  useEffect(() => {
    const project = snapshot.projects.find(
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
      void bridge
        .inspectProject(project.path)
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
  }, [onError, selectedProjectId, snapshot.projects]);

  const updateWorkspacePaths = useCallback((nextPaths: string[]) => {
    const trimmed = nextPaths.map((path) => path.trim());
    const normalized = Array.from(new Set(trimmed.filter(Boolean)));
    if (trimmed[trimmed.length - 1] === "") normalized.push("");
    setWorkspacePaths(normalized);
    setRootPath(normalized[0] ?? "");
  }, []);

  const scanWorkspace = useCallback(async () => {
    const nextPaths = workspacePaths.map((path) => path.trim()).filter(Boolean);
    if (!nextPaths.length) {
      onError(translate(language, "enterWorkspace"));
      return;
    }
    setIsScanning(true);
    setRootPath(nextPaths[0] ?? "");
    setWorkspacePaths(nextPaths);
    onError(null);
    onMessage({ type: "scanning" });
    workspaceScanInFlight.current = true;
    try {
      const nextSnapshot = await scanAllWorkspaces(nextPaths);
      applyWorkspaceSnapshot(nextSnapshot);
      onMessage({ type: "projects", count: nextSnapshot.projects.length });
    } catch (scanError) {
      onError(
        scanError instanceof Error ? scanError.message : String(scanError),
      );
      onMessage({ type: "localized", key: "scanFailed" });
    } finally {
      workspaceScanInFlight.current = false;
      setIsScanning(false);
    }
  }, [
    applyWorkspaceSnapshot,
    language,
    onError,
    onMessage,
    scanAllWorkspaces,
    workspacePaths,
  ]);

  const refreshProject = useCallback(
    async (project: ProjectSnapshot) => {
      if (refreshingProjectId) return;
      setRefreshingProjectId(project.id);
      onError(null);
      detailRequest.current += 1;
      try {
        const details = await bridge.inspectProject(project.path);
        const isStillSelected = selectedProjectIdRef.current === project.id;
        const nextProjects = snapshot.projects.map((candidate) =>
          candidate.id === project.id ? details : candidate,
        );
        workspaceFingerprintRef.current = snapshotFingerprint({
          ...snapshot,
          projects: nextProjects,
          scannedAt: details.scannedAt,
        });
        setSnapshot((current) => ({
          ...current,
          projects: current.projects.map((candidate) =>
            candidate.id === project.id ? details : candidate,
          ),
          scannedAt: details.scannedAt,
        }));
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
    [onError, onMessage, refreshingProjectId, snapshot],
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
      snapshot.projects.find((project) => project.id === selectedProjectId) ??
      snapshot.projects[0],
    [selectedProjectId, snapshot.projects],
  );

  return {
    rootPath,
    workspacePaths,
    snapshot,
    selectedProjectId,
    selectedProject,
    inspectorProject,
    isLoadingDetails,
    isScanning,
    refreshingProjectId,
    updateInspectorProject,
    updateWorkspacePaths,
    selectProject,
    scanWorkspace,
    refreshProject,
  };
}
