# Atrium 技术方案候选比较

状态：已锁定为 Tauri 2 + React/TypeScript + Rust。本文件保留候选方案、性能
判断和取舍依据，作为技术决策记录；不再表示当前方案仍待选择。

## 决策结论

Atrium 一期采用 `Tauri 2 + React + TypeScript + Rust`：React 负责高密度看板、
主题和布局，Rust 负责本地文件/Git/进程能力，Tauri 负责跨平台桌面壳与窄 IPC
边界。这个组合在 macOS、Windows、Linux 上都保留了桌面应用形态，同时避免把
项目自己的构建责任复制到 Atrium 内部。

## 1. 先看真实性能需求

Atrium 不是游戏、视频编辑器或实时协作白板。它的主要负载是：

- 枚举几十到几百个项目目录；
- 读取少量 manifest 和配置文件；
- 调用 Git 读取状态和近期提交；
- 启动项目自有的 Run / Check / Build 进程；
- 展示表格、卡片、矩阵和命令输出。

因此，决定体验的通常不是 UI 框架的绘制速度，而是：

1. 扫描是否异步、可取消、增量化；
2. Git 是否有缓存和并发上限；
3. 命令进程是否独立于 UI、可观察、可停止；
4. IPC 是否传输过大的输出；
5. 主题、布局和列表是否避免无意义重渲染。

所有下面列出的主流方案都能满足一期性能要求。差异主要在运行时体积、系统集成、视觉一致性、开发成本和长期维护。

## 2. 候选方案总览

| 方案                  | UI 技术                     | 本地能力 | 资源占用 | macOS / Windows / Linux | 主要优势                                                 | 主要代价                                                           | Atrium 适配度 |
| --------------------- | --------------------------- | -------- | -------- | ----------------------- | -------------------------------------------------------- | ------------------------------------------------------------------ | ------------- |
| Tauri 2               | React / Vue / Svelte + Rust | 很强     | 低       | 支持                    | 小运行时、Rust 适合 Git/进程/文件系统、可沿用现有经验    | 系统 WebView 差异；Rust 学习和跨平台测试成本                       | 很高          |
| Electron              | React / Vue + Node.js       | 很强     | 较高     | 成熟支持                | Web 生态最完整、Chromium 渲染一致、Node 调用本地能力方便 | 安装包和内存更大；主进程/渲染进程安全边界要严格设计                | 很高          |
| Flutter Desktop       | Dart + Flutter Widgets      | 强       | 中等     | 稳定支持                | 自带渲染，主题和布局一致，视觉控制力强                   | 需要放弃 React/CSS；系统集成依赖插件或自写平台代码                 | 高            |
| Wails 2               | React / Vue + Go            | 很强     | 低       | 支持                    | Go 本地能力强，使用系统 WebView，前端仍可用 Web 技术     | WebView 差异、生态和团队经验不如 Tauri/Electron；Wails 3 仍是 beta | 高            |
| Avalonia              | C# + XAML / Fluent          | 强       | 中等     | 支持                    | 自己绘制控件，跨平台视觉一致，桌面能力成熟               | 需要 C#/.NET；复杂视觉需要学习 Avalonia 体系                       | 中高          |
| Qt 6                  | C++/QML 或 PySide           | 很强     | 中等     | 成熟支持                | 传统桌面能力最完整，系统集成和复杂控件成熟               | C++/QML 学习成本、打包复杂；商业闭源要认真评估许可                 | 中高          |
| Compose Multiplatform | Kotlin + Compose            | 强       | 中高     | 支持                    | 声明式 UI、硬件加速、JetBrains 生态                      | JVM/Gradle 分发较重；本地开发工具链更复杂                          | 中等          |
| .NET MAUI             | C# + XAML / Blazor          | 强       | 中等     | Windows + Mac Catalyst  | 微软生态、业务应用开发效率高                             | macOS 目标是 Mac Catalyst，不是完整 AppKit；桌面细节需要额外处理   | 中等          |
| 原生双端              | AppKit/SwiftUI + WinUI/WPF  | 最强     | 低到中   | macOS/Windows           | 两端体验最原生、系统能力最直接                           | UI 要维护两套，个人开发成本最高                                    | 中低          |
| Web + 本地守护进程    | 浏览器 + Rust/Go 服务       | 强       | 前端低   | 依赖浏览器              | UI 开发和更新最灵活，未来可接网站                        | 不是完整桌面应用；进程权限、安装和通信体验复杂                     | 中低          |

## 3. 方案分析

### 3.1 Tauri 2 + React/TypeScript + Rust

Tauri 使用系统 WebView，并通过消息传递把 Web UI 与 Rust 原生能力连接起来；官方文档列出的主要桌面目标包括 macOS、Windows 和 Linux。Windows 使用 WebView2，macOS 使用系统 WebKit。

适合 Atrium 的部分：

- Rust 可以把文件系统、Git CLI、子进程监督和 SQLite 放在一个明确的 native core；
- React/TypeScript 很适合实现三套主题、多种布局和复杂信息密度；
- 可以复用现有 `WebDock` 的 Tauri、Rust、React 经验；
- 安装包和空闲资源通常比 Electron 更轻。

需要接受的代价：

- macOS WebKit 与 Windows WebView2 的 CSS、字体、拖拽、终端输出和窗口行为要分别验收；
- Windows/macOS 仍需要各自的构建工具链和测试机；
- native core 采用 Rust 后，团队需要持续维护 Rust 类型、错误处理和跨平台分支。

性能判断：对 Atrium 足够。扫描和 Git 必须放在异步 native 任务中，UI 线程只接收增量事件和摘要。

### 3.2 Electron + React/TypeScript + Node.js

Electron 把 Chromium 和 Node.js 一起放入应用，并采用主进程、渲染进程和可选 utility process 的多进程模型。

适合 Atrium 的部分：

- Node 的 `fs`、`child_process`、PTY、Git 包和日志生态非常丰富；
- Chromium 版本由应用统一携带，三套主题和复杂 CSS 的跨平台视觉差异较小；
- React/TypeScript 以及自动化测试工具选择最多；
- 长时间运行的构建进程、终端输出和日志流实现路径直接。

代价：

- Chromium + Node 带来更大的安装包和更高的常驻内存；
- 必须严格隔离 renderer 与 Node 权限，使用 preload/context isolation/窄 IPC；
- 如果未来想做轻量、常驻、低干扰的个人工具，资源成本不如 Tauri/Wails。

性能判断：不会因为性能不足而淘汰，但需要主动做启动、空闲内存、列表渲染和进程输出优化。Electron 官方也把性能重点放在避免阻塞主进程/渲染进程、控制依赖和持续 profiling 上。

### 3.3 Flutter Desktop

Flutter 使用自己的渲染体系，不依赖 HTML/CSS WebView；官方支持 Windows、macOS 和 Linux 桌面，并提供平台集成和原生绑定路径。

适合 Atrium 的部分：

- 三套主题和多种布局可以由同一套 Widget/Theme 体系控制；
- 不需要处理 WebKit 与 WebView2 的 CSS 差异；
- 动画、列表和响应式布局的行为相对一致；
- 如果未来希望移动端也有同源 UI，扩展路线比较自然。

代价：

- 需要使用 Dart/Flutter 重写 UI，不能直接复用 React/CSS；
- 文件选择、Git、进程监督、终端输出、系统菜单等能力依赖插件或平台代码；
- 视觉稿若大量使用桌面原生行为，需要主动补齐键盘、窗口和辅助功能细节。

性能判断：对一期完全充足，且渲染一致性优于系统 WebView 路线；但它的优势主要是 UI 一致性，不是 Atrium 必须的计算性能。

### 3.4 Wails + React/TypeScript + Go

Wails 用 Go 做本地层、Web 技术做 UI，并复用系统 WebView；官方文档列出 Windows、macOS 和 Linux 支持，也提供 React/TypeScript 模板和 Go/JavaScript 绑定生成。

适合 Atrium 的部分：

- Go 的文件、进程、并发和网络库适合扫描器与运行器；
- UI 仍然可以使用 React/CSS；
- 通常比 Electron 轻，架构概念比 Tauri 更容易被只熟悉 Web 的开发者接受。

代价：

- 仍然要承担系统 WebView 差异；
- 你现有的 Rust/Tauri 经验不能直接复用；
- Wails v3 当前仍处于 beta，若追求稳定应锁定稳定版本和兼容矩阵。

性能判断：与 Tauri 同属轻量 WebView 路线，性能足够；真正的选择因素是 Go 与 Rust 的长期维护偏好。

### 3.5 Avalonia + C#

Avalonia 使用自己的渲染引擎来保持跨平台控件和视觉的一致性，官方文档列出 Windows、macOS 和 Linux 等目标。

适合 Atrium 的部分：

- 桌面应用心智模型清晰，键盘、窗口、菜单、列表和设置页比较自然；
- 不依赖浏览器 WebView，跨平台视觉可控；
- C# 适合组织扫描器、运行器和持久化服务。

代价：

- 需要接受 .NET/XAML 或 Avalonia 的 UI 体系；
- 现有 React/CSS 设计稿不能直接迁移；
- 若想复刻非常自由的 Editorial/Glass 视觉，需要较多自定义控件和主题工作。

性能判断：足够，适合桌面优先产品；如果你或 Agent 对 .NET 不熟，开发效率会显著低于 React/Tauri。

### 3.6 Qt 6 + QML/C++ 或 PySide

Qt 6 官方支持 macOS、Windows 和 Linux，并提供 Qt Quick/QML 与 Qt Widgets 两类 UI 路线。

适合 Atrium 的部分：

- 长期桌面软件能力最完整；
- 对窗口、菜单、系统通知、文件、进程和复杂控件有成熟抽象；
- QML 很适合做主题化、动画化和自定义布局。

代价：

- C++/QML 工程复杂度较高；PySide 降低了编码门槛，但打包和运行时管理仍然存在；
- 需要认真设计 Qt 版本、部署方式和第三方库许可；
- Qt 的开源许可包含 LGPL/GPL 等条件，部分模块可能有额外限制；商业闭源发布前必须做合规检查。

性能判断：很强，但对 Atrium 属于能力过剩。除非未来要发展成复杂 IDE、设备管理器或高密度原生桌面套件，否则投入产出比不如 Tauri/Electron/Flutter。

### 3.7 Compose Multiplatform Desktop

JetBrains 的 Compose Multiplatform 支持 Windows、macOS 和 Linux 桌面，并提供硬件加速的桌面 UI、菜单、快捷键、窗口和通知扩展。

适合 Atrium 的部分：

- Kotlin 声明式 UI 适合主题与布局切换；
- 对喜欢 JetBrains 工具链的团队较舒服；
- 将来若做 Android/iOS 同源 UI，有扩展空间。

代价：

- JVM/Gradle 运行时和打包链相对重；
- 本地 Git/进程能力要通过 Kotlin/JVM API 或平台桥接组织；
- 对个人 OPC 来说，工具链和构建时间可能比产品本身更重。

性能判断：渲染能力足够，但常驻资源、启动和分发复杂度需要专项验证。

### 3.8 .NET MAUI

.NET MAUI 的桌面目标包括 Windows 和 macOS，但 macOS 目标是 Mac Catalyst，Windows 目标使用 WinUI 3。

适合 Atrium 的部分：

- 如果已有 C#/.NET 服务、桌面工具和部署体系，复用价值高；
- 业务表单、设置、数据录入类界面开发效率不错；
- 可共享一定的业务层代码。

主要问题：

- Mac Catalyst 与原生 AppKit 不是一回事，桌面菜单、窗口和系统行为需要特别验收；
- 对本地开发工具型应用，Blazor/MAUI 的组合会增加 WebView 或运行时层次；
- Linux 不是 .NET MAUI 的主要官方桌面目标。

性能判断：一期够用，但不是这类工具的优先方案，除非你明确希望统一进入 .NET 生态。

### 3.9 原生双端：macOS AppKit/SwiftUI + Windows WinUI/WPF

这是体验最原生的路线：macOS 与 Windows 分别使用各自 UI 和系统 API，底层可以共享一个 Rust/Go 核心。

优点是系统菜单、窗口、文件对话框、通知、辅助功能和平台规范最自然。缺点是 UI、交互、测试和发布至少维护两套，个人开发的持续成本最高。

只有在以下情况下才值得选：

- Atrium 的核心竞争力是极致原生体验；
- 你愿意维护两套前端；
- 未来有更多开发者共同维护。

### 3.10 Web + 本地守护进程

浏览器负责 UI，Rust/Go 服务负责本地扫描和命令执行。它可以通过 localhost/WebSocket 通信。

优点是 UI 最容易更新，也最容易将一部分功能迁移到个人网站。问题是安装、权限、服务生命周期、端口安全、浏览器兼容和“它到底是不是桌面应用”都要额外设计。

它适合作为未来 Website Server 的协议层，不建议作为一期主桌面形态。

## 4. 选择建议

### 第一梯队：本次决策前值得做 POC

1. Tauri 2 + React/TypeScript + Rust
2. Electron + React/TypeScript + Node.js
3. Flutter Desktop
4. Wails + React/TypeScript + Go

### 第二梯队：有明确生态偏好时选择

- Avalonia：偏 C#、桌面原生、视觉一致；
- Qt：偏成熟桌面平台能力，接受 C++/许可治理；
- Compose：偏 Kotlin/JetBrains 生态；
- .NET MAUI：已有 .NET 业务体系，接受 Mac Catalyst。

### 特殊路线

- 原生双端：追求极致平台体验，但不适合当前个人开发资源；
- Web + 守护进程：适合作为未来协议或辅助模式，不适合作为一期唯一形态。

## 5. 建议的技术验证矩阵

在最终选择前，四个第一梯队方案都只做同一个小型 POC，不做完整产品：

1. 扫描 `~/projects` 下的项目；
2. 读取每个仓库的分支、工作区状态和 20 条提交；
3. 从 `package.json`、`Cargo.toml`、`pubspec.yaml` 和 Makefile 发现命令；
4. 启动一个短命令和一个长命令，观察输出、取消和退出码；
5. 切换三套主题和两种布局；
6. 在 macOS 与 Windows 各构建一次安装包；
7. 记录冷启动、首次扫描、再次扫描、空闲内存、命令输出延迟和失败恢复。

最终不以“谁的理论性能最高”决定，而以以下顺序决定：

1. 本地文件/Git/进程能力是否可靠；
2. macOS/Windows 体验是否一致且可测试；
3. 一个人和 Agent 是否能长期维护；
4. 主题、布局和无 Stage 信息模型是否自然；
5. 安装包、启动和空闲资源是否达到个人工具的舒适范围。
