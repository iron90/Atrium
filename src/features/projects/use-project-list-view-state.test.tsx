import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { demoSnapshot } from "../../bridge/fake-bridge";
import { useProjectListViewState } from "./use-project-list-view-state";

describe("project list view state", () => {
  it("derives filter options and visible projects from repository facts", () => {
    const projects = demoSnapshot("/workspace").projects;
    const { result } = renderHook(() => useProjectListViewState(projects, {}));

    expect(result.current.projectSort).toBe("name");
    expect(result.current.filterOptions.platforms.length).toBeGreaterThan(0);
    expect(result.current.visibleProjects).toHaveLength(projects.length);

    act(() => result.current.setSearch("Snap"));

    expect(
      result.current.visibleProjects.map((project) => project.name),
    ).toEqual(["SnapCutout"]);
  });

  it("keeps filter state local to the list view", () => {
    const projects = demoSnapshot("/workspace").projects;
    const { result } = renderHook(() => useProjectListViewState(projects, {}));

    act(() => {
      result.current.setPlatformFilter("windows");
      result.current.setShowHiddenProjects(true);
    });

    expect(result.current.platformFilter).toBe("windows");
    expect(result.current.showHiddenProjects).toBe(true);
  });
});
