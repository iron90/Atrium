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
3. 当前宿主匹配时，严格按报告"Host requirements and verification"一节实测：运行 manifest 绑定的同一条命令；check 必须以退出码 0 完整结束；build 必须以退出码 0 结束且本次运行生成全部声明的产物；run 必须通过就绪或冒烟验证。把证据记入验证矩阵，只有完整成功后才把宿主写入 [build_profiles.verification]。当前宿主匹配但验证无法完成时（缺少签名身份、凭证、SDK 或工具链），用 [[build_profiles.<profile-id>.verification_blockers]] 声明阻塞（action、host、原因），不要让操作停留在无记录的待验证状态。验证证据跟随命令：多个 profile 绑定同一条命令做同一动作时，每个宿主只需运行一次，把该宿主记录到每个相同绑定名下；声明的阻塞同样按命令与宿主生效，相同绑定自动继承；绝不为相同的绑定在同宿主重复运行同一条命令。
4. 红线：宿主不匹配是"延后验证"而不是失败——不要因此删除命令绑定或宿主要求；绝不把未验证的宿主写入 verification；绝不为得到退出码 0 而缩窄 check 范围；不得终止或重配 Atrium 及其他外部进程；端口被占用、凭证/SDK/签名身份/工具链缺失属于环境阻塞——用真实原因在 manifest 中声明为阻塞项，不要伪装成不支持，也不要以此为由跳过确认接入。
5. 按项目现有图标规则声明实际使用的图标路径；声明每个 profile 实际生成的 artifacts；[cleanup] 应完整声明所有随构建或工具运行增长、且可由项目自身命令重建的目录——包括构建工具链的整个默认输出目录（例如 Rust target 及其 debug、release 和各 target-triple 子目录）、包管理器与工具缓存、生成的产物目录，不要只声明与构建 profile 关联的目录；声明前确认项目命令能重建其内容，且其中没有手工状态或凭证。
6. 只把引导报告中的 BEGIN ATRIUM MANAGED RULES 到 END ATRIUM MANAGED RULES 标记块添加或更新到仓库的 AGENTS.md，保留文件中的其他项目规则。若 ${metadataPath} 表明引导版本比托管块更新，先按迁移说明更新。
7. 只有在 manifest 与托管块都已同步、且当前宿主上每个已绑定的 action 都有着落（已写入 [build_profiles.verification]，或在 [[build_profiles.verification_blockers]] 中带原因声明为阻塞）时，才创建或更新 .atrium/guidance-sync.toml（写入 ${metadataPath} 中当前的 guidance_revision 和 protocol_schema）。已声明的阻塞不阻止确认接入：先如实声明，再写确认文件。绝不用删除命令、缩窄 check 范围或虚构宿主支持来换取确认。
8. 只运行项目自身的命令；不要启动、控制或终止 Atrium 及其进程；不要修改 Git 历史。

完成后请汇报：修改过的文件、声明的平台/渠道、命令绑定，以及一张验证矩阵（profile、action、host、实际执行的完整命令、最终退出码、成功后置条件）。对未声明、宿主不匹配、延后或阻塞的宿主分别说明原因；当前宿主的每个环境阻塞都必须出现在 manifest 的 verification_blockers 中并写明原因，全部声明有着落后更新 guidance-sync。`;
  }

  return `You are the development Agent for the project "${project.name}" at ${project.path}

First read these Atrium guidance files from the repository — they contain the complete binding and verification rules, the manifest template, the commands Atrium discovered, and the current issues:
- ${metadataPath}
- ${configurationPath}

Complete the Atrium integration for this project. The rules in the guidance report are authoritative; the steps below are the required sequence:

1. Create or correct .atrium/manifest.toml from the template in the guidance report, declaring only the platforms, channels, and build profiles this project genuinely supports. Do not invent targets, commands, artifacts, or cleanup paths.
2. Bind run / check / build for every build profile to commands the project already owns (see the discovered command list in the report). Run must start the actual target for the profile's platform and channel, not only a subordinate service required by another runtime; omit run instead of guessing when no reliable entry exists. Build must not install, replace, or open an application.
3. When the current host matches, verify exactly as the report's "Host requirements and verification" section requires: run the exact command bound in the manifest; check must finish with exit code 0; build must finish with exit code 0 and produce every declared artifact during that run; run must pass an available readiness or smoke check. Record the proof in the verification matrix and add the host to [build_profiles.verification] only after complete success. When the current host matches but verification cannot complete — a missing signing identity, credential, SDK, or toolchain — declare the blocker with [[build_profiles.<profile-id>.verification_blockers]] (action, host, reason) instead of leaving the action silently pending. Verification evidence follows the command: when several profiles bind the same command for the same action, execute it once per host and record the verified host under each identical binding; a declared blocker likewise applies per command and host, and identical bindings inherit it; never re-run an identical command on a host where it has already passed solely because another profile binds it too.
4. Red lines: a host mismatch is deferred verification, not a failure — never delete a command binding or a host requirement because the current host does not match. Never write an unverified host into verification. Never narrow the check scope just to obtain exit code 0. Do not terminate or reconfigure Atrium or other external processes. Occupied ports and missing credentials, SDKs, signing identities, or toolchains are environmental blockers: declare them in the manifest with their real reason, never disguise them as unsupported, and never use them to skip the acknowledgement.
5. Declare the icon path used by the project's existing icon convention, the artifacts each profile actually produces, and a complete [cleanup] set: every directory that grows across builds or tool runs and can be regenerated by the project's own commands — the build toolchain's whole default output directory (for example a Rust target directory with its debug, release, and target-triple children), package and tool caches, and generated bundles — not only the directories referenced by build profiles. Verify before declaring that the project's commands regenerate the content and that no manual or credential state lives inside.
6. Add or update only the BEGIN ATRIUM MANAGED RULES to END ATRIUM MANAGED RULES block from the guidance report in the repository's AGENTS.md, preserving all other project instructions. If ${metadataPath} shows a newer guidance revision than the managed block, apply the migration instructions first.
7. Only after the manifest and the managed block are synchronized and every action bound in the manifest on the current host is accounted for — verified in [build_profiles.verification] or declared as a blocker with a reason in [[build_profiles.verification_blockers]] — create or update .atrium/guidance-sync.toml with the current guidance_revision and protocol_schema from ${metadataPath}. A declared blocker does not block the acknowledgement: record it truthfully, then acknowledge. Never confirm synchronization by deleting commands, narrowing the check scope, or inventing host support.
8. Run only the project's own commands. Do not launch, control, or terminate Atrium or its processes. Do not rewrite Git history.

When finished, report the changed files, the declared platforms and channels, the command bindings, and a verification matrix with profile, action, host, the exact command executed, the final exit code, and the success postcondition (readiness/smoke result or artifacts produced by that run). List separately why any host is undeclared, mismatched, deferred, or blocked; every matching-host environmental blocker must appear in the manifest's verification_blockers with its reason, and guidance-sync must be updated once all declarations are accounted for.`;
};
