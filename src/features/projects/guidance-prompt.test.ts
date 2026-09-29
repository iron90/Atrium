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
    expect(prompt).toContain("- .atrium/guidance.toml");
    expect(prompt).toContain("- .atrium/reports/project-configuration.md");
    expect(prompt).toContain("引导报告中的规则是权威版本");
    expect(prompt).toContain("1. ");
    expect(prompt).toContain("8. ");
    expect(prompt).toContain("BEGIN ATRIUM MANAGED RULES");
    expect(prompt).toContain("AGENTS.md");
    expect(prompt).toContain("[build_profiles.verification]");
    expect(prompt).toContain('宿主不匹配是"延后验证"而不是失败');
    expect(prompt).toContain("绝不把未验证的宿主写入 verification");
    expect(prompt).toContain("绝不为得到退出码 0 而缩窄 check 范围");
    expect(prompt).toContain("验证矩阵");
    expect(prompt).toContain(
      "每个宿主只需运行一次，把该宿主记录到每个相同绑定名下",
    );
    expect(prompt).toContain("不要更新 guidance-sync");
    expect(prompt).toContain("不要启动、控制或终止 Atrium");
    expect(prompt).toContain("不要修改 Git 历史");
  });

  it("renders the English instructions and falls back to protocol paths", () => {
    const prompt = createConfigurationAgentPrompt(project, [], "en");

    expect(prompt).toContain(`project "${project.name}"`);
    expect(prompt).toContain("- .atrium/guidance.toml");
    expect(prompt).toContain("- .atrium/reports/project-configuration.md");
    expect(prompt).toContain(
      "The rules in the guidance report are authoritative",
    );
    expect(prompt).toContain("1. ");
    expect(prompt).toContain("8. ");
    expect(prompt).toContain("BEGIN ATRIUM MANAGED RULES");
    expect(prompt).toContain("AGENTS.md");
    expect(prompt).toContain("[build_profiles.verification]");
    expect(prompt).toContain(
      "a host mismatch is deferred verification, not a failure",
    );
    expect(prompt).toContain(
      "Never write an unverified host into verification",
    );
    expect(prompt).toContain(
      "Never narrow the check scope just to obtain exit code 0",
    );
    expect(prompt).toContain("verification matrix");
    expect(prompt).toContain(
      "execute it once per host and record the verified host under each identical binding",
    );
    expect(prompt).toContain("do not update guidance-sync");
    expect(prompt).toContain("Do not launch, control, or terminate Atrium");
    expect(prompt).toContain("Do not rewrite Git history");
  });
});
