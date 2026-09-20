import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bridge, type ProjectGuidanceReport } from "../../bridge";
import { demoSnapshot } from "../../bridge/fake-bridge";
import { useProjectGuidanceActions } from "./use-project-guidance-actions";

const baseProject = demoSnapshot("/workspace").projects[0];
const completeProtocol = {
  ...baseProject.protocol,
  capabilities: baseProject.protocol.capabilities.map((capability) => ({
    ...capability,
    status: "configured" as const,
  })),
};
const guidanceReport: ProjectGuidanceReport = {
  paths: [".atrium/reports/project-configuration.md", ".atrium/guidance.toml"],
  configurationStatus: "configured",
  guidanceRevision: 2,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("project guidance actions", () => {
  it("keeps an update prompt available for a complete protocol", async () => {
    vi.spyOn(bridge, "generateProjectGuidance").mockResolvedValue(
      guidanceReport,
    );
    const project = {
      ...baseProject,
      protocol: completeProtocol,
      guidance: { revision: 0, needsUpdate: true, needsSync: true },
    };
    const { result } = renderHook(() =>
      useProjectGuidanceActions({ language: "en", onError: vi.fn() }),
    );

    await act(async () => {
      await result.current.generateGuidance(project);
    });

    expect(result.current.isAgentPromptForGuidanceUpdate).toBe(true);
    expect(result.current.agentPrompt).toContain(".atrium/guidance.toml");
    expect(result.current.agentPrompt).toContain(
      ".atrium/reports/project-configuration.md",
    );
  });

  it("keeps an update prompt available for an older protocol schema", async () => {
    vi.spyOn(bridge, "generateProjectGuidance").mockResolvedValue(
      guidanceReport,
    );
    const project = {
      ...baseProject,
      protocol: { ...completeProtocol, needsUpdate: true },
      guidance: { revision: 1, needsUpdate: false, needsSync: false },
    };
    const { result } = renderHook(() =>
      useProjectGuidanceActions({ language: "en", onError: vi.fn() }),
    );

    await act(async () => {
      await result.current.generateGuidance(project);
    });

    expect(result.current.isAgentPromptForGuidanceUpdate).toBe(true);
  });
});
