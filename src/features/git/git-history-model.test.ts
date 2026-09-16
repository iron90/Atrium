import { describe, expect, it } from "vitest";
import { demoSnapshot } from "../../bridge/fake-bridge";
import type { GitCommit, ProjectSnapshot } from "../../bridge";
import { collectTimelineCommits } from "./git-history-model";

const baseProject = demoSnapshot("/workspace").projects[0];

const commit = (sha: string, timestamp: number): GitCommit => ({
  sha,
  shortSha: sha.slice(0, 7),
  author: "Atrium",
  timestamp,
  subject: sha,
});

const projectWithCommits = (
  id: string,
  name: string,
  commits: GitCommit[],
): ProjectSnapshot => ({
  ...baseProject,
  id,
  name,
  path: `/workspace/${id}`,
  repo: {
    ...baseProject.repo!,
    recentCommits: commits,
  },
});

describe("git history model", () => {
  it("sorts timeline commits deterministically when timestamps collide", () => {
    const projects = [
      projectWithCommits("zeta", "Same project", [commit("zeta-commit", 10)]),
      projectWithCommits("alpha", "Same project", [commit("alpha-commit", 10)]),
      projectWithCommits("earlier", "Earlier project", [commit("older", 9)]),
    ];

    expect(
      collectTimelineCommits(projects).map(
        ({ project, commit: item }) => `${project.id}:${item.sha}`,
      ),
    ).toEqual(["alpha:alpha-commit", "zeta:zeta-commit", "earlier:older"]);
  });

  it("uses commit SHA as the final tie-breaker within one project", () => {
    const project = projectWithCommits("atrium", "Atrium", [
      commit("z-commit", 10),
      commit("a-commit", 10),
    ]);

    expect(
      collectTimelineCommits([project]).map(({ commit: item }) => item.sha),
    ).toEqual(["a-commit", "z-commit"]);
  });
});
