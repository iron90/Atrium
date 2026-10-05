# Atrium

[English](README.md) | 简体中文

[![Quality](https://github.com/iron90/Atrium/actions/workflows/quality.yml/badge.svg)](https://github.com/iron90/Atrium/actions/workflows/quality.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

![Atrium 看板，右侧为选中项目的详情卡片](docs/assets/board-overview.png)

Atrium 是一个面向本地项目的可视化看板。它能扫描指定工作区，读取每个项目自己的 `.atrium/manifest.toml` 声明，把 Git 状态、平台与渠道上下文、存储、构建配置、运行记录这些内容整合进同一个看板，便于掌握项目状态并管理。
应用基于 Tauri 2：React/TypeScript 界面加 Rust 原生内核，界面提供中英双语。

## 项目

项目页列出工作区里发现的每个项目：

- 搜索、按平台或渠道筛选、按名称/Git 状态/最近修改/存储占用排序。
- 收藏和隐藏项目；隐藏只影响看板，不动文件。
- 工作区每 10 秒自动刷新一次，内容有变化才更新列表；选中的项目也可以手动刷新。

选中项目后，右侧显示项目详情卡片，自上而下依次是：

- **仓库** —— 本地路径、远端、检出分支、上下游同步数和工作区状态；只读分支选择器
  无需 checkout 即可查看其他分支的历史。
- **Atrium 协议** —— 从 `.atrium/manifest.toml` 读出的能力状态，一键生成引导文件和
  可复制给项目开发 Agent 的提示词，让项目开发 Agent 完成 Atrium 协议的接入，不入侵项目本身的代码。
- **已声明上下文** —— 项目声明的平台和渠道。
- **存储** —— 项目体积和可清理条目，支持逐项勾选。
- **构建配置** —— 项目绑定的 Check / Build / Run 命令。
- **发现的仓库命令** —— 从项目自身发现的命令，仅在用户确认后才展示。
- **实时输出** —— 运行命令后，在这里查看输出和最终结果。
- **持久化运行记录** —— 命令的运行记录，日志可打开、可复制。
- **近期提交** —— 已加载的提交历史，以及所看分支的领先/落后数。

你可以在设置页调整需要显示的内容模块（基础模块除外）。

## Git 历史

选择项目后，时间线列出它的提交；在版本变化面板填入起始和目标版本（提交、分支或 tag 均可），查看两个版本之间的文件变更与增删行统计，摘要可复制为 JSON。

## 设置

- **工作区** —— 添加、编辑、移除 Atrium 扫描的目录，支持确定性的排除名称；扫描入口
  只在这里。
- **外观** —— 三套主题、两种布局和中英文界面切换。
- **项目详情卡片** —— 切换项目详情模块的显示状态。

## 下载

从 [GitHub Releases](https://github.com/iron90/Atrium/releases) 下载 macOS（`.dmg`）
和 Windows（`.msi` / `.exe`）安装包。产物未做签名：macOS 首次打开需要右键选择
「打开」，Windows 会显示一次 SmartScreen 提示。

## 如何让 Atrium 获取完整项目功能

在**Atrium 协议**中一键生成引导文件和 AI 提示词，将提示词粘贴到正在负责项目开发的 Agent 对话框中并发送，Agent 会自动按照提示词要求完成 Atrium 协议的接入。

## 开发

环境要求：Node.js 24（见 `.nvmrc`）和 Rust 1.97.1（锁定在
`rust-toolchain.toml`）。

```sh
npm install
npm run dev
```

仅预览浏览器界面：

```sh
npm run dev:web
```

浏览器预览渲染确定性的演示数据，不会扫描真实仓库。

`npm run quality` 依次执行格式化、类型检查、lint、单元测试、前端构建和 Rust 的
format/test/clippy 门禁——与 CI 在每次推送时检查的内容一致。

`scripts/generate-icon.swift` 在 macOS 上重新生成 `src-tauri/icons/icon.png`。

## 文档

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) —— 架构与持久化边界。
- [docs/ATRIUM_PROTOCOL.md](docs/ATRIUM_PROTOCOL.md) —— 项目接入看板的契约文档。
- [AGENTS.md](AGENTS.md) —— 面向编码 Agent 的实现护栏。

## 许可证

[MIT](LICENSE)
