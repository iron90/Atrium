import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { demoSnapshot } from "../../bridge/fake-bridge";
import type { GitCommit } from "../../bridge";
import { ProjectCommitsSection } from "./ProjectCommitsSection";

const baseProject = demoSnapshot("/workspace").projects[0];

const idleBranchState = {
  selectedBranch: null,
  branchOverview: null,
  branchOverviewLoading: false,
  branchOverviewError: null,
};

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
      <ProjectCommitsSection
        project={project}
        isLoading={false}
        {...idleBranchState}
      />,
    );

    expect(screen.getByText("commit subject 12")).toBeInTheDocument();
    expect(container.querySelectorAll(".commit-row")).toHaveLength(12);
  });

  it("switches to the selected branch's commits with its position", () => {
    const project = {
      ...baseProject,
      repo: {
        ...baseProject.repo!,
        branch: "main",
        recentCommits: [
          {
            sha: "head-1",
            shortSha: "head-1",
            author: "Atrium",
            timestamp: 2,
            subject: "head commit",
          },
        ],
      },
    };

    render(
      <ProjectCommitsSection
        project={project}
        isLoading={false}
        selectedBranch="feature"
        branchOverview={{
          branch: "feature",
          aheadOfHead: 2,
          behindHead: 5,
          commits: [
            {
              sha: "feat-1",
              shortSha: "feat-1",
              author: "Atrium",
              timestamp: 1,
              subject: "feature commit",
            },
          ],
        }}
        branchOverviewLoading={false}
        branchOverviewError={null}
      />,
    );

    expect(screen.getByText("feature commit")).toBeInTheDocument();
    expect(screen.queryByText("head commit")).not.toBeInTheDocument();
    expect(screen.getByText(/feature · /)).toBeInTheDocument();
  });

  it("keeps the head snapshot when the selected branch is the checked-out one", () => {
    const project = {
      ...baseProject,
      repo: {
        ...baseProject.repo!,
        branch: "main",
        recentCommits: [
          {
            sha: "head-1",
            shortSha: "head-1",
            author: "Atrium",
            timestamp: 2,
            subject: "head commit",
          },
        ],
      },
    };

    render(
      <ProjectCommitsSection
        project={project}
        isLoading={false}
        selectedBranch="main"
        branchOverview={null}
        branchOverviewLoading={false}
        branchOverviewError={null}
      />,
    );

    expect(screen.getByText("head commit")).toBeInTheDocument();
  });
});
