import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunFinished } from "../../bridge";
import { demoSnapshot } from "../../bridge/fake-bridge";
import { ProjectRunHistorySection } from "./ProjectRunHistorySection";

const listRunHistoryMock = vi.hoisted(() => vi.fn());
const openRunLogMock = vi.hoisted(() => vi.fn());

vi.mock("../../bridge", () => ({
  bridge: {
    listRunHistory: listRunHistoryMock,
    openRunLog: openRunLogMock,
  },
}));

const project = demoSnapshot("/workspace").projects[0];
const otherProject = demoSnapshot("/workspace").projects[1];

const record = (overrides: Partial<RunFinished> = {}): RunFinished => ({
  runId: "run-1",
  projectId: project.id,
  commandId: "command-1",
  profileId: null,
  profileAction: null,
  projectPath: project.path,
  platform: null,
  channel: null,
  gitBranch: null,
  gitCommit: null,
  worktreeClean: null,
  displayCommand: "npm test",
  startedAt: 1,
  finishedAt: Date.now() - 60_000,
  durationMs: 2000,
  status: "failed",
  exitCode: 1,
  stdout: "boom",
  stderr: "",
  ...overrides,
});

afterEach(() => {
  cleanup();
  listRunHistoryMock.mockReset();
  openRunLogMock.mockReset();
});

describe("ProjectRunHistorySection", () => {
  it("shows only this project's history entries", async () => {
    listRunHistoryMock.mockResolvedValue([
      record(),
      record({ runId: "run-other", projectId: otherProject.id }),
      record({ runId: "run-ok", status: "succeeded", exitCode: 0 }),
    ]);

    render(<ProjectRunHistorySection project={project} />);

    await waitFor(() =>
      expect(screen.getByText("Persistent run history")).toBeInTheDocument(),
    );
    expect(screen.getAllByText("npm test")).toHaveLength(2);
    expect(screen.queryByText("failed")).toBeInTheDocument();
    expect(screen.getByText(/exit 0/)).toBeInTheDocument();
    expect(listRunHistoryMock).toHaveBeenCalledTimes(1);
  });

  it("reloads history when the refresh token changes", async () => {
    listRunHistoryMock.mockResolvedValue([record()]);
    const { rerender } = render(
      <ProjectRunHistorySection project={project} refreshToken={0} />,
    );
    await waitFor(() => expect(listRunHistoryMock).toHaveBeenCalledTimes(1));

    rerender(
      <ProjectRunHistorySection project={project} refreshToken={1} />,
    );
    await waitFor(() => expect(listRunHistoryMock).toHaveBeenCalledTimes(2));
  });

  it("opens a run log through the bridge", async () => {
    listRunHistoryMock.mockResolvedValue([record()]);
    openRunLogMock.mockResolvedValue(undefined);

    render(<ProjectRunHistorySection project={project} />);
    await waitFor(() => expect(screen.getByText("Open log")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Open log"));

    await waitFor(() =>
      expect(openRunLogMock).toHaveBeenCalledWith("run-1"),
    );
  });

  it("shows an empty message when the project has no runs", async () => {
    listRunHistoryMock.mockResolvedValue([
      record({ projectId: otherProject.id }),
    ]);

    render(<ProjectRunHistorySection project={project} />);

    await waitFor(() =>
      expect(
        screen.getByText("No completed runs for this project yet."),
      ).toBeInTheDocument(),
    );
  });
});
