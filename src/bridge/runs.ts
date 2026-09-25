import { invoke } from "@tauri-apps/api/core";
import { fakeRun } from "./fake-bridge";
import type { ProfileAction, RunFinished, RunStarted } from "./types";

export const nativeRunMethods = {
  runProjectCommand: async (
    projectPath: string,
    commandId: string,
    profileId?: string,
    profileAction?: ProfileAction,
  ): Promise<RunStarted> =>
    invoke<RunStarted>("run_project_command", {
      projectPath,
      commandId,
      profileId,
      profileAction,
    }),

  listRunHistory: async (): Promise<RunFinished[]> =>
    invoke<RunFinished[]>("list_run_history_command"),

  openRunLog: async (runId: string): Promise<void> =>
    invoke<void>("open_run_log_command", { runId }),

  stopProjectCommand: async (runId: string): Promise<void> =>
    invoke<void>("stop_project_command", { runId }),
};

export const previewRunMethods = {
  // profileAction is accepted for contract parity; the preview has no
  // profile-action simulation to feed it into.
  runProjectCommand: async (
    projectPath: string,
    commandId: string,
    profileId?: string,
    profileAction?: ProfileAction,
  ): Promise<RunStarted> => {
    void profileAction;
    return fakeRun(projectPath, commandId, profileId);
  },

  listRunHistory: async (): Promise<RunFinished[]> => [],

  openRunLog: async (): Promise<void> => undefined,

  stopProjectCommand: async (): Promise<void> => undefined,
};
