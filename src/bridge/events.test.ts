import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeToCleanupProgress, subscribeToRunEvents } from "./events";
import type {
  CleanupProgress,
  RunError,
  RunFinished,
  RunOutput,
  RunStarted,
} from "./types";

const listenMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

const tauriInternalsKey = "__TAURI_INTERNALS__";

describe("run event bridge", () => {
  beforeEach(() => {
    listenMock.mockReset();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown })[
      tauriInternalsKey
    ];
  });

  afterEach(() => {
    delete (window as Window & { __TAURI_INTERNALS__?: unknown })[
      tauriInternalsKey
    ];
  });

  it("does not access Tauri events in the browser runtime", async () => {
    const unsubscribe = await subscribeToRunEvents({
      onStarted: vi.fn(),
      onOutput: vi.fn(),
      onFinished: vi.fn(),
      onError: vi.fn(),
    });

    unsubscribe();

    expect(listenMock).not.toHaveBeenCalled();
  });

  it("forwards native events and cleans up both subscriptions", async () => {
    Object.defineProperty(window, tauriInternalsKey, {
      configurable: true,
      value: {},
    });

    const unlistenOutput = vi.fn();
    const unlistenStarted = vi.fn();
    const unlistenFinished = vi.fn();
    const unlistenError = vi.fn();
    const handlers = new Map<string, (event: { payload: unknown }) => void>();
    listenMock.mockImplementation(
      (eventName: string, handler: (event: { payload: unknown }) => void) => {
        handlers.set(eventName, handler);
        return Promise.resolve(
          eventName === "run-started"
            ? unlistenStarted
            : eventName === "run-output"
              ? unlistenOutput
              : eventName === "run-finished"
                ? unlistenFinished
                : unlistenError,
        );
      },
    );

    const onStarted = vi.fn();
    const onOutput = vi.fn();
    const onFinished = vi.fn();
    const onError = vi.fn();
    const unsubscribe = await subscribeToRunEvents({
      onStarted,
      onOutput,
      onFinished,
      onError,
    });
    const output: RunOutput = {
      runId: "run-1",
      stream: "stdout",
      line: "ready",
    };
    const started = {
      runId: "run-1",
      projectId: "project-1",
      commandId: "command-1",
      profileId: null,
      displayCommand: "echo ready",
      startedAt: 1,
      status: "running",
    } satisfies RunStarted;
    const finished = {
      runId: "run-1",
      projectId: "project-1",
      commandId: "command-1",
      profileId: null,
      profileAction: null,
      projectPath: "/tmp/project",
      platform: null,
      channel: null,
      gitBranch: null,
      gitCommit: null,
      worktreeClean: null,
      displayCommand: "echo ready",
      startedAt: 1,
      finishedAt: 2,
      durationMs: 1,
      status: "succeeded",
      exitCode: 0,
      stdout: "ready",
      stderr: "",
    } satisfies RunFinished;
    const runError: RunError = {
      runId: "run-1",
      message: "Could not persist run history",
    };

    handlers.get("run-started")?.({ payload: started });
    handlers.get("run-output")?.({ payload: output });
    handlers.get("run-finished")?.({ payload: finished });
    handlers.get("run-error")?.({ payload: runError });
    unsubscribe();

    expect(onStarted).toHaveBeenCalledWith(started);
    expect(onOutput).toHaveBeenCalledWith(output);
    expect(onFinished).toHaveBeenCalledWith(finished);
    expect(onError).toHaveBeenCalledWith(runError);
    expect(unlistenStarted).toHaveBeenCalledOnce();
    expect(unlistenOutput).toHaveBeenCalledOnce();
    expect(unlistenFinished).toHaveBeenCalledOnce();
    expect(unlistenError).toHaveBeenCalledOnce();
  });

  it("forwards cleanup progress in the native runtime", async () => {
    Object.defineProperty(window, tauriInternalsKey, {
      configurable: true,
      value: {},
    });

    const unlisten = vi.fn();
    listenMock.mockResolvedValue(unlisten);
    const onProgress = vi.fn();
    const unsubscribe = await subscribeToCleanupProgress(onProgress);
    const handler = listenMock.mock.calls[0]?.[1] as (event: {
      payload: CleanupProgress;
    }) => void;
    const progress: CleanupProgress = {
      phase: "deleting",
      relativePath: "dist/app.js",
      completedBytes: 10,
      totalBytes: 20,
      completedFiles: 1,
      totalFiles: 2,
      percent: 50,
    };

    handler({ payload: progress });
    unsubscribe();

    expect(listenMock).toHaveBeenCalledWith(
      "cleanup-progress",
      expect.any(Function),
    );
    expect(onProgress).toHaveBeenCalledWith(progress);
    expect(unlisten).toHaveBeenCalledOnce();
  });
});
