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

请先读取仓库中的以下 Atrium 引导文件：
- ${metadataPath}
- ${configurationPath}

请根据引导文件和项目当前实际情况，完成 Atrium 接入配置：
本次必须逐项复核已有 Run 绑定：Run 必须运行该 profile 的 platform 和 channel 对应的实际目标。通用 dev 命令在 Mac 上启动 macOS 应用，不能证明 Windows profile 的 Run 可用；在 Mac 上成功构建 Windows 产物也不能作为 Windows Run 的证据。开发入口只有在实际运行目标匹配时才有效。请在验证矩阵记录运行中的目标平台、渠道配置和就绪结果。宿主要求是命令的执行环境下限；当前宿主不匹配时不要执行、不要将其视为失败，也不要删除命令绑定。只有当前宿主匹配时才进行实际验证，并将通过验证的宿主写入 verification 记录。Atrium 对 macos、windows、linux 桌面目标的 Run 强制要求宿主与目标系统一致；暂不支持通过兼容层或远程入口跨系统运行桌面目标。其他目标按项目宿主声明判断。Check、Build 的宿主支持独立判断。没有匹配入口时省略 Run 并说明原因；目标宿主暂时不可用时保留命令和宿主要求，标记为延后验证，不要因为宿主不匹配而阻止 guidance-sync。

1. 创建或修正 .atrium/manifest.toml。
2. 只声明项目真实支持的平台和渠道，不要猜测或补充不存在的目标。
3. 先识别每个构建配置对应的主要运行目标和项目已有的本地运行入口。run 应绑定能启动或提供该主要目标的现有命令：Web 项目可以使用开发服务器；桌面项目应使用项目自身的桌面启动入口；CLI、游戏或移动端应使用项目已有的运行入口。没有明确可靠入口时不要猜测，移除该字段并在汇报中说明。
4. 不要把只服务于另一个运行时的底层服务单独作为 run，例如桌面外壳依赖的前端开发服务器。规则与具体框架无关；只有项目实际使用某个框架时，才使用该项目已有的框架启动命令，例如 Tauri 项目可以使用 tauri dev。
5. 为每个平台 × 渠道组合绑定项目中已经存在的 Run、Check、Build 命令，不要在 Atrium 中重新发明构建命令。Check 应是项目已有的测试、Lint、类型检查或其他质量验证入口，并通过退出码表示结果；Build 应生成该配置声明的可分发产物。
6. 将构建目标平台、宿主要求和验证结果分开记录。“platform”表示产物目标；[build_profiles.host_requirements] 表示命令可以在哪些宿主环境执行，是验证的下限，不等于当前宿主已经验证通过。[build_profiles.verification] 记录每个操作已经完整验证通过的宿主，是验证的上限。对每个 profile 的每个 run、check、build 候选宿主，都必须检查实际 program、args、working directory、脚本展开后的目标、SDK 和工具链。当前宿主不在 host_requirements 中时，不要运行该命令，也不要把它视为失败或删除绑定；在验证矩阵中记录为“宿主不匹配，延后验证”。当前宿主满足要求时，必须运行 manifest 绑定的同一条项目命令：check 必须完整退出且退出码为 0；build 必须完整退出且退出码为 0，并确认本次运行新生成 artifacts 中声明的必要产物（存在、非空、路径和类型正确，不能用构建前遗留文件充数）；run 必须证明主要目标真实启动并通过项目可用的就绪或冒烟验证，而不只是进程被拉起。只有通过完整验证后，才能把宿主加入 verification；验证失败、依赖缺失或工具链不可用时，不要把宿主加入 verification，也不要仅因为这些原因删除 host_requirements 或命令绑定。不能用目标平台、target triple、runner 名称、某个可执行文件存在、CI 配置、某个子步骤成功或中间日志作为成功证据。交叉编译也必须在宿主上用完整工具链实际生成并验证产物；例如 cargo-xwin、cross 或目标三元组存在本身不构成证据。如果项目没有真实入口或命令本身已不存在，才移除命令绑定并说明原因。只有确实证明命令不受宿主限制时，才可以省略 host_requirements；省略不能表示“暂时没有检查”。
7. 验证前先检查命令是否依赖固定端口、后台服务、凭证、SDK 或其他环境状态。Atrium 及其他外部进程不得被终止或重配。端口已被占用时，不要把冲突直接当成项目命令失败：只有项目本身已经支持通过环境变量、命令行参数或测试配置隔离端口时，才能使用该机制验证，并在验证矩阵记录实际端口；不得为了验证临时修改或提交项目配置。无法安全隔离时，将该操作标记为环境阻塞、未验证，不要把它伪装为“不支持”或只删除命令字段来完成同步。
8. 先根据项目真实质量门槛选择 check 命令，再执行验证。完整 check 失败后，不得仅为了得到退出码 0 改绑一个更窄的测试命令；只有项目本来就定义了这个较窄命令且它确实是该 profile 的明确检查范围时才可以使用，并须在报告中说明范围。端口、依赖、凭证或工具链导致的失败必须保留为阻塞。
9. Build 只负责调用项目已有的构建流程并生成产物，不要把安装、替换或打开系统中的应用作为 Build 命令或附加动作；安装必须是用户明确触发的独立操作。
10. 按项目现有图标规则声明实际使用的图标路径；不要替换图标、强制统一尺寸或改变项目原有图标和构建流程。
11. 为每个构建配置声明项目实际生成的文件或目录到 artifacts；Atrium 不会根据框架默认目录猜测产物。
12. 根据项目实际结构补充 [cleanup] 中可安全重建的缓存和构建目录；没有明确目录时不要猜测。
13. 检查 manifest、图标路径、命令引用、宿主系统声明、验证记录、产物声明和清理声明是否有效，并运行适合本项目的验证命令。
14. 将 project-configuration 引导文件中的 BEGIN ATRIUM MANAGED RULES 到 END ATRIUM MANAGED RULES 标记块添加或更新到仓库的 AGENTS.md；只维护这个标记块，保留文件中的其他项目规则。
15. 如果 ${metadataPath} 表明引导版本比 AGENTS.md 中的 Atrium 规则更新，先按最新引导文件中的迁移说明更新 manifest 和这个标记块。
16. 只有在 manifest 和 AGENTS.md 中的标记块都实际同步完成，并且当前宿主上所有适用的 profile/action 都已验证成功，其他宿主要么已经写入 verification、要么明确记录为宿主不匹配而延后验证，且不存在当前宿主上的端口、依赖、凭证、工具链等未解决阻塞时，才创建或更新 .atrium/guidance-sync.toml。宿主不匹配不是环境失败，不要因此阻止同步；当前宿主匹配但验证失败或未完成时，保留已有同步文件不变（没有就不要创建），汇报“未完成”。不得通过删除命令、缩小检查范围或伪造宿主列表来确认同步。
17. 只运行项目自身的检查或构建命令；不要启动、控制或终止 Atrium 及其进程。

不要修改 Git 历史。完成后请汇报修改过的文件、声明的平台/渠道、命令绑定，以及一张验证矩阵：profile、action、host、实际执行的完整命令、最终退出码，以及成功后置条件（就绪/冒烟结果或本次生成的产物）。对未声明、宿主不匹配或验证失败的宿主分别列出原因；如果当前宿主存在环境阻塞，明确标记“未完成”，并且不要更新 guidance-sync；不要把未验证的宿主写入 verification，但不要因为当前宿主不匹配而删除 host_requirements 中的项目声明。`;
  }

  return `You are the development Agent for the project "${project.name}" at ${project.path}

First read these Atrium guidance files from the repository:
- ${metadataPath}
- ${configurationPath}

Complete the Atrium integration based on the guidance and the project's actual structure:
Re-audit every existing Run binding: Run must start the actual target for that profile's platform and channel. A generic dev command launching a macOS application does not verify Windows Run; building Windows artifacts on macOS is not evidence of Windows Run support either. Development entries qualify only when the actual runtime matches the profile target. Record the running target platform, channel configuration, and readiness in the verification matrix. host_requirements declares compatible execution hosts; verification records hosts where the exact action passed. A host mismatch is expected deferral, not a failure: preserve the command binding and do not acknowledge it as verified until the matching host is available. Atrium requires matching host and target systems for Run on macos, windows, and linux desktop profiles. Cross-system desktop Run is not supported, including through compatibility layers or remote launchers. Other targets use their declared host requirements. Evaluate Check and Build hosts independently. Omit Run and explain only if no matching project-owned entry exists; if the required host matches the current host but the command or environment cannot be verified, retain the blocker and do not acknowledge guidance-sync.

1. Create or update .atrium/manifest.toml.
2. Declare only platforms and channels that this project genuinely supports; do not invent targets.
3. Identify the primary runnable target and the project's existing local entry point for each build profile. "run" must bind to an existing command that starts or provides that target: a web project may use its development server; a desktop project should use its own desktop launcher; CLI, game, and mobile projects should use their existing local run entry. If there is no clear, reliable entry point, do not guess; remove the field and report it.
4. Do not bind "run" only to a subordinate service used by another runtime, such as a frontend server required by a desktop shell. This rule is framework-neutral; use a framework command only when the project actually uses that framework, for example "tauri dev" is valid for a Tauri project.
5. Bind each platform × channel combination to existing project Run, Check, and Build commands. Do not invent replacement commands in Atrium. "check" should be the project's existing tests, lint, typecheck, or other quality-validation entry that reports success or failure through its exit code; "build" should produce the distributable artifacts declared for the profile.
6. Keep the artifact target, compatible execution hosts, and verification evidence separate. "platform" is the target of the produced artifact. [build_profiles.host_requirements] declares the hosts where the action may execute; [build_profiles.verification] records hosts where the exact action has passed. For every profile action and candidate host, inspect the actual program, args, working directory, expanded scripts, SDKs, and toolchain. If the current host is not listed in host_requirements, do not run the command, do not call it a failure, and do not remove the command binding; record the host mismatch as deferred verification. When the current host matches, run the exact project command bound in the manifest: "check" must finish with exit code 0; "build" must finish with exit code 0 and produce the declared artifacts during that run (each required artifact must exist, be non-empty, and have the expected path/type; pre-existing stale files do not count); "run" must start the primary target and pass an available readiness or smoke check, not merely spawn a process. Add a host to verification only after this complete verification succeeds. Do not add a host after a failure or missing dependency, but do not delete host_requirements or the command solely because the current environment is unavailable. Do not treat the target platform, target triple, runner name, an installed executable, CI configuration, an intermediate log, or a successful sub-step as proof. Cross-compilation is supported only when the complete toolchain is present on the host and the exact command produces and verifies the target artifact; the presence of cargo-xwin, cross, or a target triple is not evidence. Remove a command only when no real project-owned entry exists. Omit an action's host field only when you have actually established that the command is host-independent; omission must not mean "not checked".
7. Before validation, check whether a command depends on a fixed port, background service, credential, SDK, or other environment state. Do not terminate or reconfigure Atrium or another external process. If a port is occupied, do not treat the collision itself as proof that the project command fails: use an alternate port only when the project already supports it through an environment variable, command-line option, or test configuration, and record the actual port in the verification matrix. Do not temporarily edit or commit project configuration just to avoid the collision. If safe isolation is unavailable, mark the action as environment-blocked and unverified; do not disguise it as unsupported or delete the command field just to complete synchronization.
8. Select the check command from the project's real quality gate before running validation. After a full check fails, do not rebind a narrower test merely to obtain exit code 0; use a narrower command only when the project already defines it and it is the explicit scope for that profile, and report that scope. Port, dependency, credential, or toolchain failures remain blockers.
9. "build" only invokes the project's existing build flow and produces artifacts. Do not use it to install, replace, or open an application on the system, and do not add those side effects around it; installation is a separate, explicit user action.
10. Declare the icon path used by the project according to its existing icon convention; do not replace the icon, impose a universal size, or change the normal icon/build pipeline.
11. Declare the files or directories actually produced by each build profile in artifacts; Atrium does not infer artifacts from framework defaults.
12. Add only cache and build directories that are safe to regenerate to [cleanup] based on the project's actual structure; do not guess when there is no clear directory.
13. Validate the manifest, icon path, command references, host requirements, verification records, artifact declarations, and cleanup declarations, then run the checks appropriate for this project.
14. Add or update only the BEGIN ATRIUM MANAGED RULES to END ATRIUM MANAGED RULES block from the project-configuration guidance in the repository's AGENTS.md, preserving all other project instructions.
15. If ${metadataPath} indicates a guidance revision newer than the Atrium rules in AGENTS.md, apply the migration instructions in the latest guidance files, then update the manifest and the managed block.
16. Only after the manifest and the marked block in AGENTS.md are actually synchronized, every action applicable to the current host is verified successfully, and other declared hosts are either recorded in verification or explicitly deferred because they do not match the current host, create or update .atrium/guidance-sync.toml with guidance_revision and protocol_schema set to the current values from ${metadataPath}. A host mismatch is not an environment blocker. If the current host matches but verification fails or remains incomplete, leave the existing sync file untouched (or do not create one), report the integration as incomplete, and never confirm synchronization by deleting commands, narrowing the check scope, or inventing host support.
17. Run only the project's own checks or build commands; do not launch, control, or terminate Atrium or its processes.

Do not rewrite Git history. When finished, report the files changed, declared platforms/channels, command bindings, and a verification matrix containing the profile, action, host, exact command executed, final exit code, and success postcondition (readiness/smoke result or artifacts produced by that run). List separately why any host is undeclared, mismatched, deferred, or failed; if a matching-host environment blocker remains, mark the integration incomplete and do not update guidance-sync; never write an unverified host into verification, and never delete a host_requirements declaration merely because the current host does not match.`;
};
