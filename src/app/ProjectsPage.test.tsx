import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectsPage } from "./ProjectsPage";
import { demoSnapshot } from "../bridge/fake-bridge";
import type { ProjectInspectorProps } from "../features/projects/ProjectInspector";
import type { ProjectListProps } from "../features/projects/ProjectList";

afterEach(() => {
  cleanup();
});

const inspector = {
  isLoading: false,
  onRun: () => undefined,
  onRefreshProject: () => undefined,
  isRefreshing: false,
  onStop: () => undefined,
  onGenerateGuidance: () => undefined,
  agentPrompt: null,
  isAgentPromptForGuidanceUpdate: false,
  isAgentPromptCopied: false,
  onCopyAgentPrompt: () => undefined,
  onDismissAgentPrompt: () => undefined,
  isWritingGuidance: false,
  cleanupFeedback: null,
  cleanupSelection: [],
  cleanupConfirmation: null,
  cleanupProgress: null,
  onCleanupSelectionChange: () => undefined,
  isCleaningArtifacts: false,
  onCleanArtifacts: () => undefined,
  onCancelCleanup: () => undefined,
  onConfirmCleanup: () => undefined,
  onOpenArtifact: () => undefined,
  onOpenProjectAction: () => undefined,
} satisfies ProjectInspectorProps;

const projectList = {
  projects: [],
  selectedId: undefined,
  onSelect: () => undefined,
  search: "",
  setSearch: () => undefined,
  platformFilter: "all",
  setPlatformFilter: () => undefined,
  channelFilter: "all",
  setChannelFilter: () => undefined,
  projectSort: "name",
  setProjectSort: () => undefined,
  showHidden: false,
  setShowHidden: () => undefined,
  filterOptions: { platforms: [], channels: [] },
  projectMeta: {},
  onToggleFavorite: () => undefined,
  onToggleHidden: () => undefined,
} satisfies ProjectListProps;

describe("ProjectsPage scan warnings", () => {
  it("renders workspace scan warnings when present", () => {
    const snapshot = {
      ...demoSnapshot("/workspace"),
      warnings: ["Skipped unreadable workspace entry: permission denied"],
    };

    render(
      <ProjectsPage
        snapshot={snapshot}
        visibleProjects={snapshot.projects}
        projectList={projectList}
        inspector={inspector}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Scan warnings");
    expect(
      screen.getByText("Skipped unreadable workspace entry: permission denied"),
    ).toBeInTheDocument();
  });

  it("hides the warnings block when the scan produced none", () => {
    const snapshot = demoSnapshot("/workspace");

    render(
      <ProjectsPage
        snapshot={snapshot}
        visibleProjects={snapshot.projects}
        projectList={projectList}
        inspector={inspector}
      />,
    );

    expect(document.querySelector(".scan-warnings")).toBeNull();
  });
});
