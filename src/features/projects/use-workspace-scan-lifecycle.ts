import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceSnapshot } from "../../bridge";
import { translate, type Language } from "../../i18n";
import { errorMessage } from "../../shared/errors";
import {
  SCAN_TIMEOUT_MESSAGE,
  SCAN_TIMEOUT_MS,
  withTimeout,
} from "../../shared/with-timeout";
import { snapshotFingerprint } from "./workspace-snapshot";
import { scanWorkspaces } from "./workspace-scan";
import { LatestRequestGate } from "./scan-request-gate";
import {
  WORKSPACE_REFRESH_DEFAULT_MS,
  type WorkspaceRefreshMs,
} from "./workspace-refresh";

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
  onApplySnapshot: (snapshot: WorkspaceSnapshot) => void;
  onSnapshotTimestamp: (scannedAt: number) => void;
  workspaceRefreshMs?: WorkspaceRefreshMs;
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
  onApplySnapshot,
  onSnapshotTimestamp,
  workspaceRefreshMs = WORKSPACE_REFRESH_DEFAULT_MS,
  scanWorkspacesFn = scanWorkspaces,
}: UseWorkspaceScanLifecycleOptions): UseWorkspaceScanLifecycleResult {
  const [rootPath, setRootPath] = useState(initialRootPath);
  const [workspacePaths, setWorkspacePaths] = useState(initialWorkspacePaths);
  const [isScanning, setIsScanning] = useState(false);
  const workspaceFingerprintRef = useRef(snapshotFingerprint(initialSnapshot));
  const [scanRequests] = useState(() => new LatestRequestGate());
  // Background scans retry on the chosen interval. A transient failure that
  // self-heals on the next attempt is noise, so only consecutive failures
  // surface.
  const backgroundScanFailures = useRef(0);
  const languageRef = useRef(language);

  const excludeNamesRef = useRef(excludeNames);
  const preferencesRef = useRef(preferences);
  const onErrorRef = useRef(onError);
  const applyScannedSnapshotRef = useRef<(next: WorkspaceSnapshot) => void>(
    () => undefined,
  );

  useEffect(() => {
    languageRef.current = language;
    excludeNamesRef.current = excludeNames;
    preferencesRef.current = preferences;
    onErrorRef.current = onError;
  }, [language, excludeNames, preferences, onError]);

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
    void withTimeout(
      scanWorkspacesFn({
        paths: savedPaths,
        excludeNames: excludeNamesRef.current,
        language: languageRef.current,
      }),
      SCAN_TIMEOUT_MS,
      SCAN_TIMEOUT_MESSAGE,
    )
      .then((nextSnapshot) => {
        if (!nextSnapshot || disposed || !scanRequests.isCurrent(requestId)) {
          return;
        }
        applyScannedSnapshotRef.current(nextSnapshot);
        backgroundScanFailures.current = 0;
        onErrorRef.current(null);
      })
      .catch((scanError) => {
        if (disposed || !scanRequests.isCurrent(requestId)) return;
        backgroundScanFailures.current += 1;
        if (backgroundScanFailures.current >= 2) {
          onErrorRef.current(errorMessage(scanError));
        }
      })
      .finally(() => {
        scanRequests.finish(requestId);
      });

    return () => {
      disposed = true;
    };
  }, [nativeRuntime, scanRequests, scanWorkspacesFn]);

  useEffect(() => {
    if (
      !nativeRuntime ||
      workspaceRefreshMs === 0 ||
      !workspacePaths.some((path) => path.trim())
    ) {
      return undefined;
    }

    let disposed = false;
    const refreshWorkspace = async () => {
      if (disposed || scanRequests.isBusy) return;
      const requestId = scanRequests.begin();
      // Background polls stay silent: announcing each one would overwrite the
      // status banner and bury messages the user should read. Only real
      // changes and failures are reported.
      try {
        const nextSnapshot = await withTimeout(
          scanWorkspacesFn({
            paths: workspacePaths,
            excludeNames: excludeNamesRef.current,
            language: languageRef.current,
          }),
          SCAN_TIMEOUT_MS,
          SCAN_TIMEOUT_MESSAGE,
        );
        if (disposed || !scanRequests.isCurrent(requestId)) return;
        backgroundScanFailures.current = 0;
        onError(null);
        const changed =
          workspaceFingerprintRef.current !== snapshotFingerprint(nextSnapshot);
        if (changed) {
          applyScannedSnapshot(nextSnapshot);
          onError(null);
        } else {
          onSnapshotTimestamp(nextSnapshot.scannedAt);
        }
      } catch (refreshError) {
        if (!disposed && scanRequests.isCurrent(requestId)) {
          backgroundScanFailures.current += 1;
          if (backgroundScanFailures.current >= 2) {
            onError(errorMessage(refreshError));
          }
        }
      } finally {
        scanRequests.finish(requestId);
      }
    };

    const interval = window.setInterval(
      () => void refreshWorkspace(),
      workspaceRefreshMs,
    );
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [
    applyScannedSnapshot,
    nativeRuntime,
    onError,
    onSnapshotTimestamp,
    scanWorkspacesFn,
    scanRequests,
    workspacePaths,
    workspaceRefreshMs,
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
    const requestId = scanRequests.begin();
    try {
      const nextSnapshot = await withTimeout(
        scanWorkspacesFn({
          paths: nextPaths,
          excludeNames,
          language,
        }),
        SCAN_TIMEOUT_MS,
        SCAN_TIMEOUT_MESSAGE,
      );
      if (!scanRequests.isCurrent(requestId)) return;
      applyScannedSnapshot(nextSnapshot);
      backgroundScanFailures.current = 0;
      onError(null);
    } catch (scanError) {
      if (scanRequests.isCurrent(requestId)) {
        onError(errorMessage(scanError));
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
