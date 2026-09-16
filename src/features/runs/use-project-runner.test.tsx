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
});
