import { describe, expect, it } from "vitest";
import type { ProjectStorage } from "../../bridge";
import { cleanupPathsForProject } from "./use-project-inspector-actions";

const storage: ProjectStorage = {
  totalBytes: 120,
  cleanableBytes: 100,
  entries: [
    {
      relativePath: "target",
      kind: "build",
      bytes: 80,
      fileCount: 4,
    },
    {
      relativePath: "dist",
      kind: "build",
      bytes: 20,
      fileCount: 2,
    },
  ],
};

describe("project inspector cleanup selection", () => {
  it("uses the explicit selection when present", () => {
    expect(cleanupPathsForProject(storage, ["dist"])).toEqual(["dist"]);
  });

  it("falls back to all declared storage entries", () => {
    expect(cleanupPathsForProject(storage, [])).toEqual(["target", "dist"]);
    expect(cleanupPathsForProject(null, [])).toEqual([]);
  });
});
