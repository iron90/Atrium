import { describe, expect, it } from "vitest";
import type { RunFinished } from "../../bridge";
import { renderRunLogText } from "./run-log-text";

const record: RunFinished = {
  runId: "run-1",
  projectId: "project-1",
  commandId: "command-1",
  profileId: "debug",
  profileAction: "build",
  projectPath: "/tmp/project",
  platform: null,
  channel: null,
  gitBranch: "main",
  gitCommit: "abc123",
  worktreeClean: true,
  displayCommand: "npm run build",
  startedAt: 1,
  finishedAt: 2001,
  durationMs: 2000,
  status: "succeeded",
  exitCode: 0,
  stdout: "built",
  stderr: "",
};

describe("renderRunLogText", () => {
  it("includes run facts and streams", () => {
    const text = renderRunLogText(record);
    expect(text).toContain("Command: npm run build");
    expect(text).toContain("Status: succeeded");
    expect(text).toContain("Exit code: 0");
    expect(text).toContain("Profile: debug");
    expect(text).toContain("Git branch: main");
    expect(text).toContain("--- stdout ---");
    expect(text).toContain("built");
    expect(text).toContain("--- stderr ---");
  });
});
