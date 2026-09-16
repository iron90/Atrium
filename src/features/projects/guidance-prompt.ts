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
  const iconPath =
    reportPaths.find((path) => path.endsWith("icon-conformance.md")) ??
    ".atrium/reports/icon-conformance.md";

  if (language === "zh") {
    return `你是项目「${project.name}」的开发 Agent，项目目录为：${project.path}

请先读取仓库中的以下 Atrium 引导文件：
- ${configurationPath}
- ${iconPath}

请根据引导文件和项目当前实际情况，完成 Atrium 接入配置：
1. 创建或修正 .atrium/manifest.toml。
2. 只声明项目真实支持的平台和渠道，不要猜测或补充不存在的目标。
3. 为每个平台 × 渠道组合绑定项目中已经存在的 Run、Check、Build 命令，不要在 Atrium 中重新发明构建命令。
4. 按 icon.v1 引导声明项目的标准图标路径，同时保持项目原有模板和构建流程不被破坏。
5. 为每个构建配置声明项目实际生成的文件或目录到 artifacts；Atrium 不会根据框架默认目录猜测产物。
6. 根据项目实际结构补充 [cleanup] 中可安全重建的缓存和构建目录；没有明确目录时不要猜测。
7. 检查 manifest、图标路径、命令引用、产物声明和清理声明是否有效，并运行适合本项目的验证命令。

不要修改 Git 历史。完成后请汇报修改过的文件、声明的平台/渠道、命令绑定以及验证结果。`;
  }

  return `You are the development Agent for the project "${project.name}" at ${project.path}

First read these Atrium guidance files from the repository:
- ${configurationPath}
- ${iconPath}

Complete the Atrium integration based on the guidance and the project's actual structure:
1. Create or update .atrium/manifest.toml.
2. Declare only platforms and channels that this project genuinely supports; do not invent targets.
3. Bind each platform × channel combination to existing project Run, Check, and Build commands. Do not invent replacement commands in Atrium.
4. Declare the canonical project icon according to the icon.v1 guidance while preserving the project's normal template and build pipeline.
5. Declare the files or directories actually produced by each build profile in artifacts; Atrium does not infer artifacts from framework defaults.
6. Add only cache and build directories that are safe to regenerate to [cleanup] based on the project's actual structure; do not guess when there is no clear directory.
7. Validate the manifest, icon path, command references, artifact declarations, and cleanup declarations, then run the checks appropriate for this project.

Do not rewrite Git history. When finished, report the files changed, declared platforms/channels, command bindings, and validation results.`;
};
