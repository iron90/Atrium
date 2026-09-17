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
1. 创建或修正 .atrium/manifest.toml。
2. 只声明项目真实支持的平台和渠道，不要猜测或补充不存在的目标。
3. 先识别每个构建配置对应的主要运行目标和项目已有的本地运行入口。run 应绑定能启动或提供该主要目标的现有命令：Web 项目可以使用开发服务器；桌面项目应使用项目自身的桌面启动入口；CLI、游戏或移动端应使用项目已有的运行入口。没有明确可靠入口时不要猜测，移除该字段并在汇报中说明。
4. 不要把只服务于另一个运行时的底层服务单独作为 run，例如桌面外壳依赖的前端开发服务器。规则与具体框架无关；只有项目实际使用某个框架时，才使用该项目已有的框架启动命令，例如 Tauri 项目可以使用 tauri dev。
5. 为每个平台 × 渠道组合绑定项目中已经存在的 Run、Check、Build 命令，不要在 Atrium 中重新发明构建命令。Check 应是项目已有的测试、Lint、类型检查或其他质量验证入口，并通过退出码表示结果；Build 应生成该配置声明的可分发产物。
6. Build 只负责调用项目已有的构建流程并生成产物，不要把安装、替换或打开系统中的应用作为 Build 命令或附加动作；安装必须是用户明确触发的独立操作。
7. 按项目现有图标规则声明实际使用的图标路径；不要替换图标、强制统一尺寸或改变项目原有图标和构建流程。
8. 为每个构建配置声明项目实际生成的文件或目录到 artifacts；Atrium 不会根据框架默认目录猜测产物。
9. 根据项目实际结构补充 [cleanup] 中可安全重建的缓存和构建目录；没有明确目录时不要猜测。
10. 检查 manifest、图标路径、命令引用、产物声明和清理声明是否有效，并运行适合本项目的验证命令。
11. 将 project-configuration 引导文件中的 BEGIN ATRIUM MANAGED RULES 到 END ATRIUM MANAGED RULES 标记块添加或更新到仓库的 AGENTS.md；只维护这个标记块，保留文件中的其他项目规则。
12. 如果 ${metadataPath} 表明引导版本比 AGENTS.md 中的 Atrium 规则更新，先按最新引导文件中的迁移说明更新 manifest 和这个标记块。
13. 只有在 manifest 和 AGENTS.md 中的标记块都实际同步完成后，才创建或更新 .atrium/guidance-sync.toml，并将其中的 guidance_revision 和 protocol_schema 设置为 ${metadataPath} 中的当前值；不要提前写入。
14. 只运行项目自身的检查或构建命令；不要启动、控制或终止 Atrium 及其进程。

不要修改 Git 历史。完成后请汇报修改过的文件、声明的平台/渠道、命令绑定以及验证结果。`;
  }

  return `You are the development Agent for the project "${project.name}" at ${project.path}

First read these Atrium guidance files from the repository:
- ${metadataPath}
- ${configurationPath}

Complete the Atrium integration based on the guidance and the project's actual structure:
1. Create or update .atrium/manifest.toml.
2. Declare only platforms and channels that this project genuinely supports; do not invent targets.
3. Identify the primary runnable target and the project's existing local entry point for each build profile. "run" must bind to an existing command that starts or provides that target: a web project may use its development server; a desktop project should use its own desktop launcher; CLI, game, and mobile projects should use their existing local run entry. If there is no clear, reliable entry point, do not guess; remove the field and report it.
4. Do not bind "run" only to a subordinate service used by another runtime, such as a frontend server required by a desktop shell. This rule is framework-neutral; use a framework command only when the project actually uses that framework, for example "tauri dev" is valid for a Tauri project.
5. Bind each platform × channel combination to existing project Run, Check, and Build commands. Do not invent replacement commands in Atrium. "check" should be the project's existing tests, lint, typecheck, or other quality-validation entry that reports success or failure through its exit code; "build" should produce the distributable artifacts declared for the profile.
6. "build" only invokes the project's existing build flow and produces artifacts. Do not use it to install, replace, or open an application on the system, and do not add those side effects around it; installation is a separate, explicit user action.
7. Declare the icon path used by the project according to its existing icon convention; do not replace the icon, impose a universal size, or change the normal icon/build pipeline.
8. Declare the files or directories actually produced by each build profile in artifacts; Atrium does not infer artifacts from framework defaults.
9. Add only cache and build directories that are safe to regenerate to [cleanup] based on the project's actual structure; do not guess when there is no clear directory.
10. Validate the manifest, icon path, command references, artifact declarations, and cleanup declarations, then run the checks appropriate for this project.
11. Add or update only the BEGIN ATRIUM MANAGED RULES to END ATRIUM MANAGED RULES block from the project-configuration guidance in the repository's AGENTS.md, preserving all other project instructions.
12. If ${metadataPath} indicates a guidance revision newer than the Atrium rules in AGENTS.md, apply the migration instructions in the latest guidance files, then update the manifest and the managed block.
13. Only after the manifest and the marked block in AGENTS.md are actually synchronized, create or update .atrium/guidance-sync.toml with guidance_revision and protocol_schema set to the current values from ${metadataPath}; do not write this acknowledgement in advance.
14. Run only the project's own checks or build commands; do not launch, control, or terminate Atrium or its processes.

Do not rewrite Git history. When finished, report the files changed, declared platforms/channels, command bindings, and validation results.`;
};
