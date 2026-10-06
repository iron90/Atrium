import { useCallback, useEffect, useState } from "react";
import { bridge, type AppUpdateInfo } from "../../bridge";

export type AppUpdatePhase =
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "downloading"
  | "ready"
  | "error";

export type AppUpdateErrorKind = "check" | "install";

export interface AppUpdateState {
  phase: AppUpdatePhase;
  info: AppUpdateInfo | null;
  progress: number | null;
  errorKind: AppUpdateErrorKind | null;
  lastCheckedAt: number | null;
}

export interface AppUpdateController {
  state: AppUpdateState;
  check: () => Promise<void>;
  install: () => Promise<void>;
  restart: () => Promise<void>;
  openReleasePage: (url: string) => Promise<void>;
}

const initialState: AppUpdateState = {
  phase: "idle",
  info: null,
  progress: null,
  errorKind: null,
  lastCheckedAt: null,
};

// Version check and in-app update for Atrium itself. Installation stays an
// explicit user action: the card only offers download-and-install once an
// update has been found.
export function useAppUpdate(autoCheck: boolean): AppUpdateController {
  const [state, setState] = useState<AppUpdateState>(initialState);

  const check = useCallback(async () => {
    setState((current) => ({ ...current, phase: "checking", errorKind: null }));
    try {
      const info = await bridge.checkForAppUpdate();
      setState({
        phase: info ? "available" : "upToDate",
        info,
        progress: null,
        errorKind: null,
        lastCheckedAt: Date.now(),
      });
    } catch {
      setState((current) => ({
        ...current,
        phase: "error",
        errorKind: "check",
        lastCheckedAt: Date.now(),
      }));
    }
  }, []);

  const install = useCallback(async () => {
    setState((current) => ({
      ...current,
      phase: "downloading",
      progress: 0,
      errorKind: null,
    }));
    try {
      await bridge.downloadAndInstallAppUpdate((percent) => {
        setState((current) => ({ ...current, progress: percent }));
      });
      setState((current) => ({ ...current, phase: "ready", progress: 100 }));
    } catch {
      setState((current) => ({
        ...current,
        phase: "error",
        errorKind: "install",
        progress: null,
      }));
    }
  }, []);

  const restart = useCallback(async () => {
    await bridge.relaunchApp();
  }, []);

  const openReleasePage = useCallback(async (url: string) => {
    try {
      await bridge.openAppReleasePage(url);
    } catch {
      // Opening the browser rarely fails; there is nothing to surface.
    }
  }, []);

  useEffect(() => {
    if (!autoCheck) return;
    // Defer the check so no state is set synchronously within the effect.
    const timer = window.setTimeout(() => void check(), 0);
    return () => window.clearTimeout(timer);
  }, [autoCheck, check]);

  return { state, check, install, restart, openReleasePage };
}
