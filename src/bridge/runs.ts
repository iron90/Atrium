import { invoke } from "@tauri-apps/api/core";
import { fakeRun } from "./fake-bridge";
import { isTauriRuntime } from "./runtime";
import type { RunFinished, RunStarted } from "./types";

export const runProjectCommand = async (
  projectPath: string,
  commandId: string,
  profileId?: string,
  profileAction?: "run" | "check" | "build",
): Promise<RunStarted> => {
  if (!isTauriRuntime()) {
    return fakeRun(projectPath, commandId, profileId);
  }
  return invoke<RunStarted>("run_project_command", {
    projectPath,
    commandId,
    profileId,
    profileAction,
  });
};

export const listRunHistory = async (): Promise<RunFinished[]> => {
  if (!isTauriRuntime()) {
    return [];
  }
  return invoke<RunFinished[]>("list_run_history_command");
};

export const openRunLog = async (runId: string): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }
  return invoke<void>("open_run_log_command", { runId });
};

export const stopProjectCommand = async (runId: string): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }
  return invoke<void>("stop_project_command", { runId });
};
