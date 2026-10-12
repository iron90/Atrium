import { act, renderHook } from "@testing-library/react";
import type { ProjectSnapshot, ProjectStorage } from "../../bridge";
import { describe, expect, it, vi } from "vitest";
import { bridge } from "../../bridge";
import {
  cleanupPathsForProject,
  useProjectCleanupActions,
} from "./use-project-cleanup-actions";

const storage: ProjectStorage = {
  totalBytes: 120,
  cleanableBytes: 100,
  isComplete: true,
  entries: [
    {
      relativePath: "target",
      kind: "build",
      bytes: 80,
      fileCount: 4,
      isComplete: true,
    },
    {
      relativePath: "dist",
      kind: "build",
      bytes: 20,
      fileCount: 2,
      isComplete: true,
    },
  ],
};

const project = {
  id: "project",
  name: "Project",
  path: "/workspace/project",
  storage,
} as ProjectSnapshot;

describe("project inspector cleanup selection", () => {
  it("uses the explicit selection when present", () => {
    expect(cleanupPathsForProject(storage, ["dist"])).toEqual(["dist"]);
  });

  it("falls back to all declared storage entries", () => {
    expect(cleanupPathsForProject(storage, [])).toEqual(["target", "dist"]);
    expect(cleanupPathsForProject(null, [])).toEqual([]);
  });

  it("opens an in-app confirmation before cleanup", () => {
    const { result } = renderHook(() =>
      useProjectCleanupActions({
        inspectorProject: project,
        onError: vi.fn(),
        updateInspectorProject: vi.fn(),
      }),
    );

    act(() => result.current.setCleanupSelection(["dist"]));
    act(() => result.current.cleanArtifacts(project));

    expect(result.current.cleanupConfirmation).toEqual(["dist"]);
  });

  it("runs cleanup only after the confirmation action", async () => {
    const updateInspectorProject = vi.fn();
    const cleanup = vi.spyOn(bridge, "cleanProjectArtifacts");
    const { result } = renderHook(() =>
      useProjectCleanupActions({
        inspectorProject: project,
        onError: vi.fn(),
        updateInspectorProject,
      }),
    );

    act(() => result.current.setCleanupSelection(["dist"]));
    act(() => result.current.cleanArtifacts(project));
    expect(cleanup).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.confirmCleanup();
    });

    expect(cleanup).toHaveBeenCalledWith(project.path, ["dist"]);
    expect(updateInspectorProject).toHaveBeenCalledTimes(1);
    expect(result.current.cleanupConfirmation).toBeNull();
    expect(result.current.cleanupSelection).toEqual([]);
    cleanup.mockRestore();
  });

  it("refreshes the project after cleanup completes", async () => {
    const onCleaned = vi.fn(async () => undefined);
    const cleanup = vi
      .spyOn(bridge, "cleanProjectArtifacts")
      .mockResolvedValue({
        removedBytes: 20,
        removedEntries: [storage.entries[1]],
        failedEntries: [],
        storage,
      });
    const { result } = renderHook(() =>
      useProjectCleanupActions({
        inspectorProject: project,
        onError: vi.fn(),
        updateInspectorProject: vi.fn(),
        onCleaned,
      }),
    );

    act(() => result.current.setCleanupSelection(["dist"]));
    act(() => result.current.cleanArtifacts(project));
    await act(async () => {
      await result.current.confirmCleanup();
    });

    expect(onCleaned).toHaveBeenCalledWith(project);
    cleanup.mockRestore();
  });
});
