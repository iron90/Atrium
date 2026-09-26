import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { RunFinished, RunStarted } from "../../bridge";
import type { FinishedRunRecord } from "../runs/use-run-event-stream";
import { RunStreamContext } from "../runs/run-stream-context";
import { ProjectRunSection } from "./ProjectRunSection";

const started: RunStarted = {
  runId: "run-1",
  projectId: "project-1",
  commandId: "command-1",
  profileId: null,
  displayCommand: "npm test",
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
  finishedAt: 2100,
  durationMs: 2000,
  status: "failed",
  exitCode: 1,
  stdout: "boom",
  stderr: "",
};

afterEach(cleanup);

describe("ProjectRunSection", () => {
  it("returns nothing without an active run or a finished result", () => {
    const { container } = render(
      <ProjectRunSection onStop={() => undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps showing a finished result after the run ends", () => {
    const lastFinishedRun: FinishedRunRecord = {
      run: finished,
      lines: ["boom"],
    };
    render(
      <ProjectRunSection
        lastFinishedRun={lastFinishedRun}
        onStop={() => undefined}
      />,
    );

    expect(screen.getByText("npm test")).toBeInTheDocument();
    expect(screen.getByText(/failed · exit 1 · 2s/)).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("reads the live run from the run stream context", () => {
    render(
      <RunStreamContext.Provider
        value={{ activeRun: started, outputLines: ["streaming"] }}
      >
        <ProjectRunSection
          lastFinishedRun={{ run: finished, lines: ["old"] }}
          onStop={() => undefined}
        />
      </RunStreamContext.Provider>,
    );

    expect(screen.getByText("Live output")).toBeInTheDocument();
    expect(screen.getByText("streaming")).toBeInTheDocument();
    expect(screen.queryByText("Last run")).not.toBeInTheDocument();
  });
});
