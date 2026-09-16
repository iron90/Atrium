import { useCallback, useEffect, useRef, useState } from "react";
import { bridge } from "../../bridge";
import { translate, type Language } from "../../i18n";
import type { ProjectSnapshot, WorkspaceSnapshot } from "../../bridge/types";
import { snapshotFingerprint } from "./model";
import { useProjectSelection } from "./use-project-selection";
import { scanWorkspaces } from "./workspace-scan";

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
  const [isScanning, setIsScanning] = useState(false);
  const workspaceFingerprintRef = useRef(snapshotFingerprint(initialSnapshot));
  const workspaceScanInFlight = useRef(false);

  const handleProjectRefreshed = useCallback(
    (project: ProjectSnapshot, details: ProjectSnapshot) => {
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
    },
    [snapshot],
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

      workspaceFingerprintRef.current = snapshotFingerprint(nextSnapshot);
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
        return scanWorkspaces({
          paths: nextPaths,
          excludeNames,
          language,
        });
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
    excludeNames,
    language,
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
        const nextSnapshot = await scanWorkspaces({
          paths: workspacePaths,
          excludeNames,
          language,
        });
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
    excludeNames,
    language,
    workspacePaths,
  ]);

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
      const nextSnapshot = await scanWorkspaces({
        paths: nextPaths,
        excludeNames,
        language,
      });
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
    excludeNames,
    onError,
    onMessage,
    language,
    workspacePaths,
  ]);

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
