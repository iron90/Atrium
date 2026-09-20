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
    expect(prompt).toContain(".atrium/guidance.toml");
    expect(prompt).toContain(".atrium/reports/project-configuration.md");
    expect(prompt).toContain("项目现有图标规则");
    expect(prompt).toContain("AGENTS.md");
    expect(prompt).toContain(".atrium/guidance-sync.toml");
    expect(prompt).toContain("主要运行目标");
    expect(prompt).toContain("不要把只服务于另一个运行时的底层服务");
    expect(prompt).toContain("[build_profiles.host_requirements]");
    expect(prompt).toContain("不代表当前系统一定能运行该命令");
    expect(prompt).toContain("完整验证并能成功完成");
    expect(prompt).toContain("不能用目标平台、target triple、runner 名称");
    expect(prompt).toContain("本次运行新生成 artifacts 中声明的必要产物");
    expect(prompt).toContain("如果某操作没有任何宿主通过验证");
    expect(prompt).toContain("端口已被占用时");
    expect(prompt).toContain("完整 check 失败后，不得仅为了得到退出码 0");
    expect(prompt).toContain("存在端口、依赖、凭证、工具链等未解决阻塞");
    expect(prompt).toContain("验证矩阵");
    expect(prompt).toContain("明确标记“未完成”");
    expect(prompt).toContain("不要更新 guidance-sync");
    expect(prompt).toContain("不要把未验证的宿主写入 manifest");
    expect(prompt).toContain("安装必须是用户明确触发的独立操作");
    expect(prompt).toContain("不要启动、控制或终止 Atrium");
    expect(prompt).toContain("不要修改 Git 历史");
  });

  it("renders the English instructions and falls back to protocol paths", () => {
    const prompt = createConfigurationAgentPrompt(project, [], "en");

    expect(prompt).toContain(`project "${project.name}"`);
    expect(prompt).toContain(".atrium/guidance.toml");
    expect(prompt).toContain(".atrium/reports/project-configuration.md");
    expect(prompt).toContain("existing icon convention");
    expect(prompt).toContain("AGENTS.md");
    expect(prompt).toContain(".atrium/guidance-sync.toml");
    expect(prompt).toContain("primary runnable target");
    expect(prompt).toContain("subordinate service");
    expect(prompt).toContain("host requirements");
    expect(prompt).toContain(
      "not proof that the command can run successfully on the current operating system",
    );
    expect(prompt).toContain("verified-success allowlist");
    expect(prompt).toContain("pre-existing stale files do not count");
    expect(prompt).toContain("If no host passes verification for an action");
    expect(prompt).toContain("If a port is occupied");
    expect(prompt).toContain(
      "After a full check fails, do not rebind a narrower test",
    );
    expect(prompt).toContain(
      "with no unresolved port, dependency, credential, or toolchain blocker",
    );
    expect(prompt).toContain("verification matrix");
    expect(prompt).toContain(
      "mark the integration incomplete and do not update guidance-sync",
    );
    expect(prompt).toContain(
      "never write an unverified host into the manifest",
    );
    expect(prompt).toContain(
      "installation is a separate, explicit user action",
    );
    expect(prompt).toContain("do not launch, control, or terminate Atrium");
    expect(prompt).toContain("Do not rewrite Git history");
  });
});
