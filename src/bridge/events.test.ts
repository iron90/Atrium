import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeToRunEvents } from "./events";
import type { RunFinished, RunOutput } from "./types";

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
      onOutput: vi.fn(),
      onFinished: vi.fn(),
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
    const unlistenFinished = vi.fn();
    const handlers = new Map<string, (event: { payload: unknown }) => void>();
    listenMock.mockImplementation(
      (eventName: string, handler: (event: { payload: unknown }) => void) => {
        handlers.set(eventName, handler);
        return Promise.resolve(
          eventName === "run-output" ? unlistenOutput : unlistenFinished,
        );
      },
    );

    const onOutput = vi.fn();
    const onFinished = vi.fn();
    const unsubscribe = await subscribeToRunEvents({ onOutput, onFinished });
    const output: RunOutput = {
      runId: "run-1",
      stream: "stdout",
      line: "ready",
    };
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

    handlers.get("run-output")?.({ payload: output });
    handlers.get("run-finished")?.({ payload: finished });
    unsubscribe();

    expect(onOutput).toHaveBeenCalledWith(output);
    expect(onFinished).toHaveBeenCalledWith(finished);
    expect(unlistenOutput).toHaveBeenCalledOnce();
    expect(unlistenFinished).toHaveBeenCalledOnce();
  });
});
