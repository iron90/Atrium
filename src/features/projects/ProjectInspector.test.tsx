import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { demoSnapshot } from "../../bridge/fake-bridge";
import {
  ProjectInspector,
  type ProjectInspectorProps,
} from "./ProjectInspector";

const baseProject = demoSnapshot("/workspace").projects[0];

afterEach(cleanup);

const baseProps = {
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
  onOpenWebService: () => undefined,
  onOpenProjectAction: () => undefined,
} satisfies ProjectInspectorProps;

const SECTION_TITLES = [
  "Storage",
  "Build profiles",
  "Discovered repository commands",
  "Persistent run history",
  "Recent commits",
];

function renderInspector(
  hiddenInspectorSections?: ProjectInspectorProps["hiddenInspectorSections"],
) {
  return render(
    <ProjectInspector
      {...baseProps}
      project={baseProject}
      hiddenInspectorSections={hiddenInspectorSections}
    />,
  );
}

describe("project inspector section visibility", () => {
  it("renders every detail-card section by default", () => {
    renderInspector();

    for (const title of SECTION_TITLES) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it("hides exactly the sections marked hidden in preferences", () => {
    renderInspector(["storage", "rawRepositoryCommands", "recentCommits"]);

    expect(screen.queryByText("Storage")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Discovered repository commands"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Recent commits")).not.toBeInTheDocument();
    expect(screen.getByText("Build profiles")).toBeInTheDocument();
    expect(screen.getByText("Persistent run history")).toBeInTheDocument();
  });
});
