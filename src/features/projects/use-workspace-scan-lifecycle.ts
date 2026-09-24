import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceSnapshot } from "../../bridge";
import { translate, type Language } from "../../i18n";
import type { WorkspaceMessage } from "../../shared/activity";
import { errorMessage } from "../../shared/errors";
import { snapshotFingerprint } from "./workspace-snapshot";
import { scanWorkspaces } from "./workspace-scan";
import { LatestRequestGate } from "./scan-request-gate";

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
  scanWorkspacesFn?: typeof scanWorkspaces;
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
  scanWorkspacesFn = scanWorkspaces,
}: UseWorkspaceScanLifecycleOptions): UseWorkspaceScanLifecycleResult {
  const [rootPath, setRootPath] = useState(initialRootPath);
  const [workspacePaths, setWorkspacePaths] = useState(initialWorkspacePaths);
  const [isScanning, setIsScanning] = useState(false);
  const workspaceFingerprintRef = useRef(snapshotFingerprint(initialSnapshot));
  const [scanRequests] = useState(() => new LatestRequestGate());
  const languageRef = useRef(language);

  const excludeNamesRef = useRef(excludeNames);
  const preferencesRef = useRef(preferences);
  const onErrorRef = useRef(onError);
  const onMessageRef = useRef(onMessage);
  const applyScannedSnapshotRef = useRef<(next: WorkspaceSnapshot) => void>(
    () => undefined,
  );

  useEffect(() => {
    languageRef.current = language;
    excludeNamesRef.current = excludeNames;
    preferencesRef.current = preferences;
    onErrorRef.current = onError;
    onMessageRef.current = onMessage;
  }, [language, excludeNames, preferences, onError, onMessage]);

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
    applyScannedSnapshotRef.current = applyScannedSnapshot;
  }, [applyScannedSnapshot]);

  useEffect(() => {
    if (!nativeRuntime) return undefined;

    const savedPreferences = preferencesRef.current;
    const savedPaths = savedPreferences.workspaces?.length
      ? savedPreferences.workspaces
      : savedPreferences.rootPath?.trim()
        ? [savedPreferences.rootPath.trim()]
        : [];
    if (!savedPaths.length) return undefined;

    let disposed = false;
    const requestId = scanRequests.begin();
    void scanWorkspacesFn({
      paths: savedPaths,
      excludeNames: excludeNamesRef.current,
      language: languageRef.current,
    })
      .then((nextSnapshot) => {
        if (!nextSnapshot || disposed || !scanRequests.isCurrent(requestId)) {
          return;
        }
        applyScannedSnapshotRef.current(nextSnapshot);
        onMessageRef.current({
          type: "projects",
          count: nextSnapshot.projects.length,
        });
      })
      .catch((scanError) => {
        if (disposed || !scanRequests.isCurrent(requestId)) return;
        onErrorRef.current(errorMessage(scanError));
        onMessageRef.current({ type: "localized", key: "scanFailed" });
      })
      .finally(() => {
        scanRequests.finish(requestId);
      });

    return () => {
      disposed = true;
    };
  }, [nativeRuntime, scanRequests, scanWorkspacesFn]);

  useEffect(() => {
    if (!nativeRuntime || !workspacePaths.some((path) => path.trim()))
      return undefined;

    let disposed = false;
    const refreshWorkspace = async () => {
      if (disposed || scanRequests.isBusy) return;
      const requestId = scanRequests.begin();
      onMessage({ type: "refreshingWorkspace" });
      try {
        const nextSnapshot = await scanWorkspacesFn({
          paths: workspacePaths,
          excludeNames: excludeNamesRef.current,
          language: languageRef.current,
        });
        if (disposed || !scanRequests.isCurrent(requestId)) return;
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
      } catch (refreshError) {
        if (!disposed && scanRequests.isCurrent(requestId)) {
          onError(errorMessage(refreshError));
          onMessage({ type: "localized", key: "refreshFailed" });
        }
      } finally {
        scanRequests.finish(requestId);
      }
    };

    const interval = window.setInterval(() => void refreshWorkspace(), 10_000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [
    applyScannedSnapshot,
    nativeRuntime,
    onError,
    onMessage,
    onSnapshotTimestamp,
    scanWorkspacesFn,
    scanRequests,
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
    const requestId = scanRequests.begin();
    try {
      const nextSnapshot = await scanWorkspacesFn({
        paths: nextPaths,
        excludeNames,
        language,
      });
      if (!scanRequests.isCurrent(requestId)) return;
      applyScannedSnapshot(nextSnapshot);
      onMessage({ type: "projects", count: nextSnapshot.projects.length });
    } catch (scanError) {
      if (scanRequests.isCurrent(requestId)) {
        onError(errorMessage(scanError));
        onMessage({ type: "localized", key: "scanFailed" });
      }
    } finally {
      scanRequests.finish(requestId);
      setIsScanning(false);
    }
  }, [
    applyScannedSnapshot,
    excludeNames,
    language,
    onError,
    onMessage,
    workspacePaths,
    scanWorkspacesFn,
    scanRequests,
  ]);

  return {
    rootPath,
    workspacePaths,
    isScanning,
    updateWorkspacePaths,
    scanWorkspace,
  };
}
