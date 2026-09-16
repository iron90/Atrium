import { describe, expect, it } from "vitest";
import { demoSnapshot } from "../../bridge/fake-bridge";
import { createConfigurationAgentPrompt } from "./guidance-prompt";

const project = demoSnapshot("/workspace").projects[0];

describe("configuration Agent prompt", () => {
  it("renders the Chinese instructions with generated report paths", () => {
    const prompt = createConfigurationAgentPrompt(
      project,
      [".atrium/reports/project-configuration.md", ".atrium/reports/icon.md"],
      "zh",
    );

    expect(prompt).toContain(`项目「${project.name}」`);
    expect(prompt).toContain(".atrium/reports/project-configuration.md");
    expect(prompt).toContain(".atrium/reports/icon-conformance.md");
    expect(prompt).toContain("不要修改 Git 历史");
  });

  it("renders the English instructions and falls back to protocol paths", () => {
    const prompt = createConfigurationAgentPrompt(project, [], "en");

    expect(prompt).toContain(`project "${project.name}"`);
    expect(prompt).toContain(".atrium/reports/project-configuration.md");
    expect(prompt).toContain(".atrium/reports/icon-conformance.md");
    expect(prompt).toContain("Do not rewrite Git history");
  });
});
