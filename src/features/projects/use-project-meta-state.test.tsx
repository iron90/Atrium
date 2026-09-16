import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { demoSnapshot } from "../../bridge/fake-bridge";
import { useProjectMetaState } from "./use-project-meta-state";

describe("project metadata state", () => {
  it("initializes metadata for newly scanned projects without overwriting edits", () => {
    const snapshot = demoSnapshot("/workspace");
    const firstProject = snapshot.projects[0];
    const { result } = renderHook(() =>
      useProjectMetaState({
        [firstProject.id]: { favorite: true, hidden: false, order: 8 },
      }),
    );

    act(() => result.current.ensureProjectMeta(snapshot));

    expect(result.current.projectMeta[firstProject.id]).toEqual({
      favorite: true,
      hidden: false,
      order: 8,
    });
    expect(Object.keys(result.current.projectMeta)).toHaveLength(
      snapshot.projects.length,
    );
  });

  it("moves visible projects through the same metadata ordering path", () => {
    const snapshot = demoSnapshot("/workspace");
    const visibleProjects = snapshot.projects.slice(0, 3);
    const { result } = renderHook(() => useProjectMetaState({}));

    act(() => result.current.ensureProjectMeta(snapshot));
    let moved = false;
    act(() => {
      moved = result.current.moveProjectByKeyboard(
        snapshot.projects,
        visibleProjects,
        visibleProjects[1].id,
        "up",
      );
    });

    expect(moved).toBe(true);
    expect(result.current.projectMeta[visibleProjects[1].id].order).toBe(0);
    expect(result.current.projectMeta[visibleProjects[0].id].order).toBe(1);
  });
});
