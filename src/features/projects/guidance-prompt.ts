import type { ProjectSnapshot } from "../../bridge";
import type { Language } from "../../i18n";

export const createConfigurationAgentPrompt = (
  project: ProjectSnapshot,
  reportPaths: string[],
  language: Language,
): string => {
  const configurationPath =
    reportPaths.find((path) => path.endsWith("project-configuration.md")) ??
    ".atrium/reports/project-configuration.md";
  const metadataPath =
    reportPaths.find((path) => path.endsWith("guidance.toml")) ??
    ".atrium/guidance.toml";

  if (language === "zh") {
    return `你是项目「${project.name}」的开发 Agent，项目目录为：${project.path}

请先读取仓库中的以下 Atrium 引导文件——完整的绑定与验证规则、manifest 模板、Atrium 已发现的命令以及当前问题都在其中：
- ${metadataPath}
- ${configurationPath}

请根据引导文件完成本项目的 Atrium 接入。引导报告中的规则是权威版本，以下步骤是必须依序完成的动作：

1. 按报告中的 manifest 模板创建或修正 .atrium/manifest.toml，只声明项目真实支持的平台、渠道和构建配置；不要发明目标、命令、产物或清理目录。
2. 为每个构建配置把 run / check / build 绑定到项目已有的命令（见报告的"已发现命令"清单）。run 必须启动该 profile 的 platform 和 channel 对应的真实目标，不能只绑定服务于其他运行时的底层服务；没有可靠入口时省略而不是猜测。build 不得安装、替换或打开应用。
3. 当前宿主匹配时，严格按报告"Host requirements and verification"一节实测：运行 manifest 绑定的同一条命令；check 必须以退出码 0 完整结束；build 必须以退出码 0 结束且本次运行生成全部声明的产物；run 必须通过就绪或冒烟验证。把证据记入验证矩阵，只有完整成功后才把宿主写入 [build_profiles.verification]。验证证据跟随命令：多个 profile 绑定同一条命令做同一动作时，每个宿主只需运行一次，把该宿主记录到每个相同绑定名下；绝不为相同的绑定在同宿主重复运行同一条命令。
4. 红线：宿主不匹配是"延后验证"而不是失败——不要因此删除命令绑定或宿主要求；绝不把未验证的宿主写入 verification；绝不为得到退出码 0 而缩窄 check 范围；不得终止或重配 Atrium 及其他外部进程；端口被占用、凭证/SDK/工具链缺失一律记为阻塞并如实汇报。
5. 按项目现有图标规则声明实际使用的图标路径；声明每个 profile 实际生成的 artifacts；[cleanup] 只声明已验证可安全重建的目录。
6. 只把引导报告中的 BEGIN ATRIUM MANAGED RULES 到 END ATRIUM MANAGED RULES 标记块添加或更新到仓库的 AGENTS.md，保留文件中的其他项目规则。若 ${metadataPath} 表明引导版本比托管块更新，先按迁移说明更新。
7. 只有在 manifest 与托管块都已同步、当前宿主上所有适用的 profile/action 都已验证成功、其他宿主已写入 verification 或明确延后时，才创建或更新 .atrium/guidance-sync.toml（写入 ${metadataPath} 中当前的 guidance_revision 和 protocol_schema）。当前宿主存在未解决阻塞时，保持已有同步文件不变（没有就不要创建），汇报"未完成"。
8. 只运行项目自身的命令；不要启动、控制或终止 Atrium 及其进程；不要修改 Git 历史。

完成后请汇报：修改过的文件、声明的平台/渠道、命令绑定，以及一张验证矩阵（profile、action、host、实际执行的完整命令、最终退出码、成功后置条件）。对未声明、宿主不匹配、延后或失败的宿主分别说明原因；当前宿主存在环境阻塞时明确标记"未完成"，并且不要更新 guidance-sync。`;
  }

  return `You are the development Agent for the project "${project.name}" at ${project.path}

First read these Atrium guidance files from the repository — they contain the complete binding and verification rules, the manifest template, the commands Atrium discovered, and the current issues:
- ${metadataPath}
- ${configurationPath}

Complete the Atrium integration for this project. The rules in the guidance report are authoritative; the steps below are the required sequence:

1. Create or correct .atrium/manifest.toml from the template in the guidance report, declaring only the platforms, channels, and build profiles this project genuinely supports. Do not invent targets, commands, artifacts, or cleanup paths.
2. Bind run / check / build for every build profile to commands the project already owns (see the discovered command list in the report). Run must start the actual target for the profile's platform and channel, not only a subordinate service required by another runtime; omit run instead of guessing when no reliable entry exists. Build must not install, replace, or open an application.
3. When the current host matches, verify exactly as the report's "Host requirements and verification" section requires: run the exact command bound in the manifest; check must finish with exit code 0; build must finish with exit code 0 and produce every declared artifact during that run; run must pass an available readiness or smoke check. Record the proof in the verification matrix and add the host to [build_profiles.verification] only after complete success. Verification evidence follows the command: when several profiles bind the same command for the same action, execute it once per host and record the verified host under each identical binding; never re-run an identical command on a host where it has already passed solely because another profile binds it too.
4. Red lines: a host mismatch is deferred verification, not a failure — never delete a command binding or a host requirement because the current host does not match. Never write an unverified host into verification. Never narrow the check scope just to obtain exit code 0. Do not terminate or reconfigure Atrium or other external processes; occupied ports and missing credentials, SDKs, or toolchains are blockers to report as-is.
5. Declare the icon path used by the project's existing icon convention, the artifacts each profile actually produces, and only cleanup directories verified as safe to regenerate.
6. Add or update only the BEGIN ATRIUM MANAGED RULES to END ATRIUM MANAGED RULES block from the guidance report in the repository's AGENTS.md, preserving all other project instructions. If ${metadataPath} shows a newer guidance revision than the managed block, apply the migration instructions first.
7. Only after the manifest and the managed block are synchronized, every action applicable to the current host is verified, and other hosts are recorded in verification or explicitly deferred, create or update .atrium/guidance-sync.toml with the current guidance_revision and protocol_schema from ${metadataPath}. If a matching-host blocker remains, leave the existing acknowledgement untouched (or do not create one) and report the integration as incomplete.
8. Run only the project's own commands. Do not launch, control, or terminate Atrium or its processes. Do not rewrite Git history.

When finished, report the changed files, the declared platforms and channels, the command bindings, and a verification matrix with profile, action, host, the exact command executed, the final exit code, and the success postcondition (readiness/smoke result or artifacts produced by that run). List separately why any host is undeclared, mismatched, deferred, or failed; if a matching-host environment blocker remains, mark the integration incomplete and do not update guidance-sync.`;
};
