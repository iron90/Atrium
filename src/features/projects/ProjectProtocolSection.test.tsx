import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoSnapshot } from "../../bridge/fake-bridge";
import { ProjectProtocolSection } from "./ProjectProtocolSection";

const baseProject = demoSnapshot("/workspace").projects[0];

afterEach(cleanup);

const renderSection = (
  project: typeof baseProject,
  isAgentPromptForGuidanceUpdate = false,
) =>
  render(
    <ProjectProtocolSection
      project={project}
      inspectedProject={project}
      agentPrompt="Generated agent prompt"
      isAgentPromptForGuidanceUpdate={isAgentPromptForGuidanceUpdate}
      isAgentPromptCopied={false}
      onCopyAgentPrompt={vi.fn()}
      isWritingGuidance={false}
      onGenerateGuidance={vi.fn()}
    />,
  );

describe("project protocol section", () => {
  it("hides the generated agent prompt after the protocol is complete", () => {
    const configuredProject = {
      ...baseProject,
      protocol: {
        ...baseProject.protocol,
        capabilities: baseProject.protocol.capabilities.map((capability) => ({
          ...capability,
          status: "configured" as const,
        })),
      },
    };

    renderSection(configuredProject);

    expect(
      screen.queryByRole("textbox", {
        name: "Prompt for the project development Agent",
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps the prompt visible while protocol guidance is still needed", () => {
    const incompleteProject = {
      ...baseProject,
      protocol: {
        ...baseProject.protocol,
        capabilities: baseProject.protocol.capabilities.map((capability) => ({
          ...capability,
          status:
            capability.id === "context"
              ? ("missing" as const)
              : ("configured" as const),
        })),
      },
    };

    renderSection(incompleteProject);

    expect(
      screen.getByRole("textbox", {
        name: "Prompt for the project development Agent",
      }),
    ).toHaveValue("Generated agent prompt");
  });

  it("offers an update when the agent guidance contract is stale", () => {
    const staleGuidanceProject = {
      ...baseProject,
      guidance: { revision: 0, needsUpdate: true, needsSync: true },
      protocol: {
        ...baseProject.protocol,
        capabilities: baseProject.protocol.capabilities.map((capability) => ({
          ...capability,
          status: "configured" as const,
        })),
      },
    };

    renderSection(staleGuidanceProject, true);

    expect(screen.getByText("Protocol needs update")).toBeInTheDocument();
    expect(
      screen.getByText("Agent guidance").closest(".protocol-capability"),
    ).toHaveClass("capability-needs-update");
    expect(
      Array.from(document.querySelectorAll(".protocol-capability strong")).map(
        (title) => title.textContent,
      ),
    ).toEqual([
      "Agent guidance",
      "Identity & icon",
      "Platform & channel context",
      "Check / Build / Run",
      "Cleanup directories",
    ]);
    expect(
      screen.getByRole("button", { name: "Update Agent guidance" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", {
        name: "Prompt for the project development Agent",
      }),
    ).toHaveValue("Generated agent prompt");
  });

  it("hides a stale prompt after a refreshed project is synchronized", () => {
    const synchronizedProject = {
      ...baseProject,
      guidance: { revision: 1, needsUpdate: false, needsSync: false },
      protocol: {
        ...baseProject.protocol,
        capabilities: baseProject.protocol.capabilities.map((capability) => ({
          ...capability,
          status: "configured" as const,
        })),
      },
    };

    renderSection(synchronizedProject, true);

    expect(
      screen.queryByRole("textbox", {
        name: "Prompt for the project development Agent",
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps the update action after guidance was generated but not acknowledged", () => {
    const unacknowledgedGuidanceProject = {
      ...baseProject,
      guidance: { revision: 1, needsUpdate: false, needsSync: true },
      protocol: {
        ...baseProject.protocol,
        capabilities: baseProject.protocol.capabilities.map((capability) => ({
          ...capability,
          status: "configured" as const,
        })),
      },
    };

    renderSection(unacknowledgedGuidanceProject);

    expect(
      screen.getByRole("button", { name: "Update Agent guidance" }),
    ).toBeInTheDocument();
  });
});
