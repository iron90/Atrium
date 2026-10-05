# Atrium

[English](README.md) | 简体中文

[![Quality](https://github.com/iron90/Atrium/actions/workflows/quality.yml/badge.svg)](https://github.com/iron90/Atrium/actions/workflows/quality.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

![Atrium 看板，右侧为选中项目的详情卡片](docs/assets/board-overview.png)

Atrium 是一个面向本机项目的可视化看板，为独立软件工作室打造。它扫描工作区、
读取每个项目自己的 `.atrium/manifest.toml` 声明，把 Git 状态、平台与渠道上下文、
存储、构建配置、运行记录这些事实整理进同一个视野，不强加项目生命周期，也不取代
仓库自身的开发工作流。应用基于 Tauri 2：React/TypeScript 界面加 Rust 原生内核，
界面提供中英双语。

## 看板

Projects 页列出工作区里发现的每个仓库。

- 搜索、按平台或渠道筛选、按名称/Git 状态/最近修改/存储占用排序。
- 收藏和隐藏项目；隐藏只影响看板，不动文件。
- 从项目行直接打开目录、终端、远端和已声明的链接。
- 事实自动刷新，选中的项目也可以手动刷新。

## 项目详情卡片

选中项目后打开详情卡片，自上而下依次是：

1. **Repository** —— 本地路径、远端、检出分支、上下游同步数和工作区状态。只读分支选择器
   无需 checkout 即可查看其他分支的历史；Atrium 不修改任何 ref。
2. **Atrium protocol** —— 从 `.atrium/manifest.toml` 读出的能力状态，一键生成引导文件和
   可复制给项目开发 Agent 的提示词。
3. **Declared context** —— 项目声明的平台和渠道。
4. **Storage** —— 项目体积和可清理条目，支持逐项勾选；清理只触碰 manifest 声明过的目录。
5. **Build profiles** —— 项目自己的 Run / Check / Build 绑定，以及每个配置显式声明的构建产物查看。
6. **Discovered repository commands** —— 仓库自身发现的命令，仅在用户确认后才展示。
7. **Runs** —— 启动绑定的操作并查看实时输出；完成的运行连同项目、配置、平台、渠道和 Git
   上下文本地留存，持久化运行历史的日志可打开、可复制。
8. **Recent commits** —— 已加载的提交历史，以及所看分支的领先/落后数。

这些区块显示哪些，由你在设置页决定——每个区块都有一个开关。

## Git 历史页

选择项目，输入提交、分支或 tag 范围，查看两个版本之间的提交与文件变更摘要，
摘要可以复制成结构化 JSON。

## 设置

- 工作区：添加、编辑、移除 Atrium 扫描的目录，支持确定性的排除名称；扫描入口只在
  这里。
- 外观：三套主题、两种布局和中英文界面切换。
- 项目详情卡片：每个区块一个开关。

## 它刻意不做的事

网站同步、支付渠道、发布编排、通用项目阶段和开发 Agent 管理都被有意排除在当前
版本之外。项目脚手架和模板复制同样不在看板的职责内：项目由它常用的开发工具创建，
Atrium 的协议引导在此之后把它接入看板。SQLite 迁移、产物历史、更新日志生成以及
Windows/Linux 主机验证仍是后续工作。

## 下载

每次推送 `v*` 标签都会自动构建 macOS（`.app` / `.dmg`）和 Windows（`.msi` /
`.exe`）安装包，并挂到对应的 [GitHub Release](https://github.com/iron90/Atrium/releases)。
产物未做签名：macOS 首次打开需要右键选择「打开」，Windows 会显示一次
SmartScreen 提示。

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
- [docs/INTERACTION_STANDARDS.md](docs/INTERACTION_STANDARDS.md) —— 交互标准。
- [docs/TECHNOLOGY_OPTIONS.md](docs/TECHNOLOGY_OPTIONS.md) —— 技术选型决策记录，只记录当时的备选与取舍，不构成更换技术栈的指令。
- [AGENTS.md](AGENTS.md) —— 面向编码 Agent 的实现护栏。

## 许可证

[MIT](LICENSE)
