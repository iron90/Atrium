import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bridge, type ProjectGuidanceReport } from "../../bridge";
import { demoSnapshot } from "../../bridge/fake-bridge";
import { useProjectGuidanceActions } from "./use-project-guidance-actions";

const baseProject = demoSnapshot("/workspace").projects[0];
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
    expect(result.current.guidanceMessage).toContain(
      "• .atrium/reports/project-configuration.md",
    );
  });
});
