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

  it("does not let a stale detail response replace the current project", async () => {
    const projects = demoSnapshot("/workspace").projects;
    const resolvers = new Map<
      string,
      (project: (typeof projects)[number]) => void
    >();
    const inspectProject = vi.fn(
      (path: string) =>
        new Promise<(typeof projects)[number]>((resolve) => {
          resolvers.set(path, resolve);
        }),
    );
    const onError = vi.fn();
    const onProjectSelected = vi.fn();
    const onProjectRefreshed = vi.fn();
    const { result } = renderHook(() =>
      useProjectSelection({
        nativeRuntime: true,
        projects,
        onError,
            onProjectSelected,
        onProjectRefreshed,
        inspectProject,
      }),
    );

    const firstProject = projects[0];
    const nextProject = projects[1];
    await waitFor(() =>
      expect(inspectProject).toHaveBeenCalledWith(firstProject.path),
    );

    act(() => result.current.selectProject(nextProject.id));
    await waitFor(() =>
      expect(inspectProject).toHaveBeenCalledWith(nextProject.path),
    );

    act(() => resolvers.get(firstProject.path)?.(firstProject));
    expect(result.current.inspectorProject).toBeUndefined();

    act(() => resolvers.get(nextProject.path)?.(nextProject));
    await waitFor(() =>
      expect(result.current.inspectorProject?.id).toBe(nextProject.id),
    );
  });

  it("does not reload selected details when another project changes", async () => {
    const projects = demoSnapshot("/workspace").projects;
    const inspectProject = vi.fn(
      async (path: string) =>
        projects.find((project) => project.path === path) ?? projects[0],
    );
    const onError = vi.fn();
    const onProjectSelected = vi.fn();
    const onProjectRefreshed = vi.fn();
    const { result, rerender } = renderHook(
      ({ currentProjects }: { currentProjects: typeof projects }) =>
        useProjectSelection({
          nativeRuntime: true,
          projects: currentProjects,
          onError,
                onProjectSelected,
          onProjectRefreshed,
          inspectProject,
        }),
      { initialProps: { currentProjects: projects } },
    );

    await waitFor(() =>
      expect(inspectProject).toHaveBeenCalledWith(projects[0].path),
    );
    inspectProject.mockClear();

    rerender({
      currentProjects: projects.map((project, index) =>
        index === 1 ? { ...project, description: "updated" } : project,
      ),
    });

    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(result.current.selectedProject?.id).toBe(projects[0].id);
    expect(inspectProject).not.toHaveBeenCalled();
  });

  it("does not reload details when the selected project receives a workspace update", async () => {
    const projects = demoSnapshot("/workspace").projects;
    const inspectProject = vi.fn(
      async (path: string) =>
        projects.find((project) => project.path === path) ?? projects[0],
    );
    const onError = vi.fn();
    const onProjectSelected = vi.fn();
    const onProjectRefreshed = vi.fn();
    const { rerender } = renderHook(
      ({ currentProjects }: { currentProjects: typeof projects }) =>
        useProjectSelection({
          nativeRuntime: true,
          projects: currentProjects,
          onError,
                onProjectSelected,
          onProjectRefreshed,
          inspectProject,
        }),
      { initialProps: { currentProjects: projects } },
    );

    await waitFor(() =>
      expect(inspectProject).toHaveBeenCalledWith(projects[0].path),
    );
    inspectProject.mockClear();

    rerender({
      currentProjects: projects.map((project, index) =>
        index === 0
          ? {
              ...project,
              protocol: {
                ...project.protocol,
                schema: 1,
                needsUpdate: true,
                manifestStatus: "configured",
              },
            }
          : project,
      ),
    });

    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(inspectProject).not.toHaveBeenCalled();
  });

  it("still reloads a project after returning to it following a manual refresh", async () => {
    const projects = demoSnapshot("/workspace").projects;
    const inspectProject = vi.fn(
      async (path: string) =>
        projects.find((project) => project.path === path) ?? projects[0],
    );
    const onError = vi.fn();
    const onProjectSelected = vi.fn();
    const onProjectRefreshed = vi.fn();
    const { result } = renderHook(() =>
      useProjectSelection({
        nativeRuntime: true,
        projects,
        onError,
            onProjectSelected,
        onProjectRefreshed,
        inspectProject,
      }),
    );

    const firstProject = projects[0];
    const nextProject = projects[1];
    await waitFor(() =>
      expect(inspectProject).toHaveBeenCalledWith(firstProject.path),
    );

    inspectProject.mockClear();
    await act(async () => {
      await result.current.refreshProject(firstProject);
    });
    act(() => result.current.selectProject(nextProject.id));
    await waitFor(() =>
      expect(inspectProject).toHaveBeenCalledWith(nextProject.path),
    );

    inspectProject.mockClear();
    act(() => result.current.selectProject(firstProject.id));
    await waitFor(() =>
      expect(inspectProject).toHaveBeenCalledWith(firstProject.path),
    );
  });
});
