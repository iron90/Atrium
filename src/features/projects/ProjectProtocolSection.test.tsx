import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
      "Cleanup directories",
      "Check / Build / Run",
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

  it("keeps disclosure content mounted while an open or close can be interrupted", () => {
    renderSection(baseProject);

    const trigger = screen.getByRole("button", { name: /Protocol details/ });
    const disclosure = document.querySelector(".animated-disclosure");

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Agent guidance")).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(disclosure).toHaveClass("is-open");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Agent guidance")).toBeInTheDocument();
  });

  it("keeps an explicitly requested prompt available after the protocol synchronizes", () => {
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

    expect(screen.getByText("Protocol integrated")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Refresh integration" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", {
        name: "Prompt for the project development Agent",
      }),
    ).toHaveValue("Generated agent prompt");
  });

  it("reports an unacknowledged integration without calling it a version update", () => {
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
      screen.getByText("Awaiting Agent acknowledgement"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Finish Agent integration" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Update Agent guidance" }),
    ).not.toBeInTheDocument();
  });

  it("offers a neutral refresh action once the protocol is integrated", () => {
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

    renderSection(synchronizedProject);

    expect(screen.getByText("Protocol integrated")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Refresh integration" }),
    ).toBeInTheDocument();
  });
});
