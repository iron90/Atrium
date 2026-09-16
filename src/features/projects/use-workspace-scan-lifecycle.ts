import { useCallback, useEffect, useRef, useState } from "react";
import { bridge } from "../../bridge";
import { translate, type Language } from "../../i18n";
import type { WorkspaceSnapshot } from "../../bridge/types";
import { snapshotFingerprint } from "./model";
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

export interface UseWorkspaceScanLifecycleOptions {
  nativeRuntime: boolean;
  preferences: WorkspacePreferences;
  initialRootPath: string;
  initialWorkspacePaths: string[];
  initialSnapshot: WorkspaceSnapshot;
  snapshot: WorkspaceSnapshot;
  excludeNames: string[];
  language: Language;
  onError: (message: string | null) => void;
  onMessage: (message: WorkspaceMessage) => void;
  onApplySnapshot: (snapshot: WorkspaceSnapshot) => void;
  onSnapshotTimestamp: (scannedAt: number) => void;
}

export interface UseWorkspaceScanLifecycleResult {
  rootPath: string;
  workspacePaths: string[];
  isScanning: boolean;
  updateWorkspacePaths: (nextPaths: string[]) => void;
  scanWorkspace: () => Promise<void>;
}

export function useWorkspaceScanLifecycle({
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
  onApplySnapshot,
  onSnapshotTimestamp,
}: UseWorkspaceScanLifecycleOptions): UseWorkspaceScanLifecycleResult {
  const [rootPath, setRootPath] = useState(initialRootPath);
  const [workspacePaths, setWorkspacePaths] = useState(initialWorkspacePaths);
  const [isScanning, setIsScanning] = useState(false);
  const workspaceFingerprintRef = useRef(snapshotFingerprint(initialSnapshot));
  const workspaceScanInFlight = useRef(false);

  useEffect(() => {
    workspaceFingerprintRef.current = snapshotFingerprint(snapshot);
  }, [snapshot]);

  const applyScannedSnapshot = useCallback(
    (nextSnapshot: WorkspaceSnapshot) => {
      workspaceFingerprintRef.current = snapshotFingerprint(nextSnapshot);
      onApplySnapshot(nextSnapshot);
    },
    [onApplySnapshot],
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
        applyScannedSnapshot(nextSnapshot);
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
    applyScannedSnapshot,
    excludeNames,
    language,
    nativeRuntime,
    onError,
    onMessage,
    preferences.rootPath,
    preferences.workspaces,
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
          applyScannedSnapshot(nextSnapshot);
          onError(null);
          onMessage({
            type: "workspaceUpdated",
            count: nextSnapshot.projects.length,
          });
        } else {
          onSnapshotTimestamp(nextSnapshot.scannedAt);
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
    applyScannedSnapshot,
    excludeNames,
    language,
    nativeRuntime,
    onError,
    onMessage,
    onSnapshotTimestamp,
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
      applyScannedSnapshot(nextSnapshot);
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
    applyScannedSnapshot,
    excludeNames,
    language,
    onError,
    onMessage,
    workspacePaths,
  ]);

  return {
    rootPath,
    workspacePaths,
    isScanning,
    updateWorkspacePaths,
    scanWorkspace,
  };
}
