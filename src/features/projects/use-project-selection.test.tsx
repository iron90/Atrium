import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { demoSnapshot } from "../../bridge/fake-bridge";
import { useProjectSelection } from "./use-project-selection";

describe("project selection state", () => {
  it("switches selection immediately while loading details asynchronously", async () => {
    const projects = demoSnapshot("/workspace").projects;
    const inspectProject = vi.fn(
      async (path: string) =>
        projects.find((project) => project.path === path) ?? projects[0],
    );
    const { result } = renderHook(() =>
      useProjectSelection({
        nativeRuntime: true,
        projects,
        onError: vi.fn(),
        onMessage: vi.fn(),
        onProjectSelected: vi.fn(),
        onProjectRefreshed: vi.fn(),
        inspectProject,
      }),
    );

    const nextProject = projects[1];
    act(() => result.current.selectProject(nextProject.id));

    expect(result.current.selectedProjectId).toBe(nextProject.id);
    expect(result.current.inspectorProject).toBeUndefined();
    expect(result.current.isLoadingDetails).toBe(true);

    await waitFor(() =>
      expect(result.current.inspectorProject?.id).toBe(nextProject.id),
    );
    expect(inspectProject).toHaveBeenCalledWith(nextProject.path);
  });
});
