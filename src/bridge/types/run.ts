import type { CommandKind, Facet } from "./common";

export type RunStatus = "running" | "succeeded" | "failed" | "cancelled";
export type OutputStream = "stdout" | "stderr";

export interface RunStarted {
  runId: string;
  projectId: string;
  commandId: string;
  profileId: string | null;
  displayCommand: string;
  startedAt: number;
  status: "running";
}

export interface RunOutput {
  runId: string;
  stream: OutputStream;
  line: string;
}

export interface RunError {
  runId: string;
  message: string;
}

export interface RunFinished {
  runId: string;
  projectId: string;
  commandId: string;
  profileId: string | null;
  profileAction: CommandKind | null;
  projectPath: string;
  platform: Facet | null;
  channel: Facet | null;
  gitBranch: string | null;
  gitCommit: string | null;
  worktreeClean: boolean | null;
  displayCommand: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  status: Exclude<RunStatus, "running">;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}
