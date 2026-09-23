import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunFinished, RunOutput, RunStarted } from "../../bridge";
import type { RunEventHandlers } from "../../bridge/events";
import { useRunEventStream } from "./use-run-event-stream";

const subscribeMock = vi.hoisted(() => vi.fn());

vi.mock("../../bridge/events", () => ({
  subscribeToRunEvents: subscribeMock,
}));

let handlers: RunEventHandlers | undefined;

const started: RunStarted = {
  runId: "run-1",
  projectId: "project-1",
  commandId: "command-1",
  profileId: null,
  displayCommand: "echo ready",
  startedAt: 1,
  status: "running",
};

const finished: RunFinished = {
  runId: started.runId,
  projectId: started.projectId,
  commandId: started.commandId,
  profileId: null,
  profileAction: null,
  projectPath: "/tmp/project",
  platform: null,
  channel: null,
  gitBranch: null,
  gitCommit: null,
  worktreeClean: null,
  displayCommand: started.displayCommand,
  startedAt: started.startedAt,
  finishedAt: 2,
  durationMs: 1,
  status: "succeeded",
  exitCode: 0,
  stdout: "ready",
  stderr: "",
};

const output: RunOutput = {
  runId: started.runId,
  stream: "stdout",
  line: "ready",
};

describe("run event stream", () => {
  beforeEach(() => {
    handlers = undefined;
    subscribeMock.mockReset();
    subscribeMock.mockImplementation(async (nextHandlers: RunEventHandlers) => {
      handlers = nextHandlers;
      return () => undefined;
    });
  });

  it("registers event-started runs without resetting received output", async () => {
    const { result } = renderHook(() =>
      useRunEventStream({
        onError: vi.fn(),
        onFinished: vi.fn(),
      }),
    );
    await waitFor(() => expect(handlers).toBeDefined());

    act(() => handlers?.onStarted(started));
    act(() => handlers?.onOutput(output));
    act(() => result.current.registerRun(started));

    expect(result.current.activeRuns[started.runId]).toEqual(started);
    expect(result.current.outputLinesFor(started.runId)).toEqual(["ready"]);
  });

  it("does not resurrect a run when completion precedes invoke registration", async () => {
    const onFinished = vi.fn();
    const { result } = renderHook(() =>
      useRunEventStream({
        onError: vi.fn(),
        onFinished,
      }),
    );
    await waitFor(() => expect(handlers).toBeDefined());

    act(() => handlers?.onFinished(finished));
    act(() => handlers?.onOutput(output));
    act(() => result.current.registerRun(started));

    expect(result.current.activeRuns).toEqual({});
    expect(result.current.outputLinesFor(started.runId)).toEqual([]);
    expect(onFinished).toHaveBeenCalledWith(finished);
  });

  it("keeps the finished run result after the active run is cleared", async () => {
    const { result } = renderHook(() =>
      useRunEventStream({
        onError: vi.fn(),
        onFinished: vi.fn(),
      }),
    );
    await waitFor(() => expect(handlers).toBeDefined());

    act(() => handlers?.onStarted(started));
    act(() => handlers?.onOutput(output));
    act(() => handlers?.onFinished(finished));

    expect(result.current.activeRuns).toEqual({});
    expect(result.current.outputLinesFor(started.runId)).toEqual([]);
    expect(result.current.finishedByProject[started.projectId]).toEqual({
      run: finished,
      lines: ["ready"],
    });
  });

  it("does not resubscribe when handler identities change", async () => {
    const onFinished = vi.fn();
    const onError = vi.fn();
    const { rerender } = renderHook(
      ({ nextFinished }: { nextFinished: (value: RunFinished) => void }) =>
        useRunEventStream({ onError, onFinished: nextFinished }),
      { initialProps: { nextFinished: onFinished } },
    );
    await waitFor(() => expect(handlers).toBeDefined());
    expect(subscribeMock).toHaveBeenCalledTimes(1);

    const nextFinished = vi.fn();
    rerender({ nextFinished });
    await new Promise((resolve) => window.setTimeout(resolve, 20));

    expect(subscribeMock).toHaveBeenCalledTimes(1);
    act(() => handlers?.onFinished(finished));
    expect(onFinished).not.toHaveBeenCalled();
    expect(nextFinished).toHaveBeenCalledWith(finished);
  });

  it("reports subscription failures through onError", async () => {
    const onError = vi.fn();
    subscribeMock.mockImplementation(async () => {
      throw new Error("permission denied");
    });

    renderHook(() => useRunEventStream({ onError, onFinished: vi.fn() }));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "permission denied" }),
      ),
    );
  });
});
