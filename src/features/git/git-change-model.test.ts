import { describe, expect, it } from "vitest";
import { demoSnapshot } from "../../bridge/fake-bridge";
import { defaultFromRevision, revisionOptions } from "./git-change-model";

const project = demoSnapshot("/workspace").projects[0];

describe("git change model", () => {
  it("keeps built-in revisions first and removes duplicates", () => {
    const options = revisionOptions({
      ...project,
      repo: {
        ...project.repo!,
        references: [{ name: "HEAD", kind: "branch", sha: "a" }],
        recentCommits: [
          ...project.repo!.recentCommits,
          project.repo!.recentCommits[0],
        ],
      },
    });

    expect(options.slice(0, 2)).toEqual(["HEAD", "HEAD~1"]);
    expect(new Set(options).size).toBe(options.length);
  });

  it("uses the second recent commit when available", () => {
    expect(defaultFromRevision(project)).toBe("7bd1e4a0");
    expect(defaultFromRevision({ ...project, repo: null })).toBe("HEAD~1");
  });
});
