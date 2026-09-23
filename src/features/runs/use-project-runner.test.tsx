import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoSnapshot } from "../../bridge/fake-bridge";
import type { RunStarted } from "../../bridge";
import { useProjectRunner } from "./use-project-runner";

const runProjectCommandMock = vi.hoisted(() => vi.fn());
const stopProjectCommandMock = vi.hoisted(() => vi.fn());

vi.mock("../../bridge", () => ({
  bridge: {
    runProjectCommand: runProjectCommandMock,
    stopProjectCommand: stopProjectCommandMock,
  },
}));

const project = demoSnapshot("/workspace").projects[0];
const command = project.commands[0];
const started: RunStarted = {
  runId: "demo-run",
  projectId: project.id,
  commandId: command.id,
  profileId: null,
  displayCommand: command.displayCommand,
  startedAt: 1,
  status: "running",
};

describe("project runner", () => {
  afterEach(() => {
    vi.useRealTimers();
    runProjectCommandMock.mockReset();
    stopProjectCommandMock.mockReset();
  });

  it("cancels preview completion when the run is stopped", async () => {
    vi.useFakeTimers();
    runProjectCommandMock.mockResolvedValue(started);
    stopProjectCommandMock.mockResolvedValue(undefined);
    const onError = vi.fn();
    const onMessage = vi.fn();
    const { result } = renderHook(() =>
      useProjectRunner({
        nativeRuntime: false,
        selectedProject: project,
        language: "en",
        onError,
        onMessage,
      }),
    );

    await act(async () => {
      await result.current.runProjectCommand(command);
    });
    await act(async () => {
      await result.current.stopActiveRun();
    });
    act(() => vi.advanceTimersByTime(700));

    expect(onMessage).toHaveBeenCalledWith({ type: "cancelled" });
    expect(onMessage).not.toHaveBeenCalledWith({
      type: "demo",
      displayCommand: command.displayCommand,
    });
  });

  it("does not register a run that starts after unmount", async () => {
    let resolveRun: (run: RunStarted) => void = () => undefined;
    runProjectCommandMock.mockReturnValue(
      new Promise<RunStarted>((resolve) => {
        resolveRun = resolve;
      }),
    );
    const { result, unmount } = renderHook(() =>
      useProjectRunner({
        nativeRuntime: false,
        selectedProject: project,
        language: "en",
        onError: vi.fn(),
        onMessage: vi.fn(),
      }),
    );

    const runPromise = result.current.runProjectCommand(command);
    unmount();
    await act(async () => {
      resolveRun(started);
      await runPromise;
    });

    expect(runProjectCommandMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a finished run result for the selected project", async () => {
    vi.useFakeTimers();
    runProjectCommandMock.mockResolvedValue(started);
    const { result } = renderHook(() =>
      useProjectRunner({
        nativeRuntime: false,
        selectedProject: project,
        language: "en",
        onError: vi.fn(),
        onMessage: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.runProjectCommand(command);
    });
    expect(result.current.lastFinishedRun).toBeUndefined();

    act(() => vi.advanceTimersByTime(700));

    expect(result.current.activeRun).toBeUndefined();
    expect(result.current.lastFinishedRun?.run.status).toBe("succeeded");
    expect(result.current.lastFinishedRun?.run.runId).toBe(started.runId);
    expect(result.current.lastFinishedRun?.lines).toEqual([
      "Demo preview completed.",
    ]);
  });

  it("keeps global run status when the selected project changes", async () => {
    runProjectCommandMock.mockResolvedValue(started);
    const secondProject = demoSnapshot("/workspace").projects[1];
    const { result, rerender } = renderHook(
      ({ selectedProject }) =>
        useProjectRunner({
          nativeRuntime: false,
          selectedProject,
          language: "en",
          onError: vi.fn(),
          onMessage: vi.fn(),
        }),
      { initialProps: { selectedProject: project } },
    );

    await act(async () => {
      await result.current.runProjectCommand(command);
    });
    rerender({ selectedProject: secondProject });

    expect(result.current.activeRun).toBeUndefined();
    expect(result.current.activeRuns).toEqual([started]);
  });
});
