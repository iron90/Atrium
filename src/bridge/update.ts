import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import type { AppUpdateInfo } from "./types";

// The updater plugin hands back a live handle for the pending update; it is
// kept here so downloadAndInstall can run after the bridge-serialized check
// result has reached the UI.
let pendingUpdate: Update | null = null;

export const nativeUpdateMethods = {
  getAppVersion: async (): Promise<string> => getVersion(),
  checkForAppUpdate: async (): Promise<AppUpdateInfo | null> => {
    pendingUpdate = (await check()) ?? null;
    if (!pendingUpdate) return null;
    return {
      version: pendingUpdate.version,
      notes: pendingUpdate.body ?? "",
      date: pendingUpdate.date ?? "",
    };
  },
  downloadAndInstallAppUpdate: async (
    onProgress?: (percent: number) => void,
  ): Promise<void> => {
    if (!pendingUpdate) throw new Error("No pending update");
    let downloaded = 0;
    let total: number | undefined;
    await pendingUpdate.downloadAndInstall((event) => {
      if (event.event === "Started") {
        total = event.data.contentLength;
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        if (total) onProgress?.(Math.round((downloaded / total) * 100));
      } else if (event.event === "Finished") {
        onProgress?.(100);
      }
    });
  },
  relaunchApp: async (): Promise<void> => {
    await relaunch();
  },
  openAppReleasePage: async (url: string): Promise<void> => {
    await invoke("open_release_page_command", { url });
  },
};

export const previewUpdateMethods = {
  getAppVersion: async (): Promise<string> => "0.1.0",
  checkForAppUpdate: async (): Promise<AppUpdateInfo | null> => null,
  downloadAndInstallAppUpdate: async (): Promise<void> => undefined,
  relaunchApp: async (): Promise<void> => undefined,
  openAppReleasePage: async (): Promise<void> => undefined,
};
