import type { RunStarted } from "./types";

export const fakeRun = async (
  projectPath: string,
  commandId: string,
  profileId?: string,
): Promise<RunStarted> => ({
  runId: `demo-${Date.now()}`,
  projectId: projectPath,
  commandId,
  profileId: profileId ?? null,
  displayCommand: "demo command",
  startedAt: Date.now(),
  status: "running",
});
