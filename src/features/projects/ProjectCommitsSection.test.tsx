import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { demoSnapshot } from "../../bridge/fake-bridge";
import type { GitCommit } from "../../bridge";
import { ProjectCommitsSection } from "./ProjectCommitsSection";

const baseProject = demoSnapshot("/workspace").projects[0];

afterEach(cleanup);

describe("project commits section", () => {
  it("renders every loaded commit instead of truncating the history", () => {
    const commits: GitCommit[] = Array.from({ length: 12 }, (_, index) => ({
      sha: `commit-${index + 1}`,
      shortSha: `commit-${index + 1}`,
      author: "Atrium",
      timestamp: index,
      subject: `commit subject ${index + 1}`,
    }));
    const project = {
      ...baseProject,
      repo: {
        ...baseProject.repo!,
        recentCommits: commits,
      },
    };

    const { container } = render(
      <ProjectCommitsSection project={project} isLoading={false} />,
    );

    expect(screen.getByText("commit subject 12")).toBeInTheDocument();
    expect(container.querySelectorAll(".commit-row")).toHaveLength(12);
  });
});
