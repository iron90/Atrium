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
        [firstProject.id]: { favorite: true, hidden: false },
      }),
    );

    act(() => result.current.ensureProjectMeta(snapshot));

    expect(result.current.projectMeta[firstProject.id]).toEqual({
      favorite: true,
      hidden: false,
    });
    expect(Object.keys(result.current.projectMeta)).toHaveLength(
      snapshot.projects.length,
    );
  });
});
