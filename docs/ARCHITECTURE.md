# Atrium 技术架构

## 1. 定位与一期边界

Atrium 是一个本地优先的跨项目可视化项目看板。它负责发现项目、展示项目
事实、调用项目已有入口并记录本地观察结果；它不替项目规定开发流程。

一期目标：

- 扫描用户选择的工作区目录，发现其中的项目仓库；
- 根据 `.atrium/manifest.toml` 的确定性声明获取平台、渠道和构建配置；
- 从项目现有配置中发现 `Run`、`Check`、`Build` 入口；
- 使用安全的参数数组调用这些入口；
- 读取 Git 分支、工作区状态、远程地址和近期提交；
- 检索仓库中已有的项目图标，并在列表和详情中复用；
- 提供可切换的中英文界面，以及可进入的 Settings 页面；
- 以多主题、多布局看板展示上述事实。

一期不做：

- Website Server 推送和远程网站同步；
- 支付、订阅和商店账号连接；
- Git 提交、Tag、Push 或其他历史改写；
- 通用项目 `Stage`、项目生命周期管理；
- 通过 Atrium 复制模板或创建项目脚手架；
- 开发 Agent 编排、聊天或任务管理。

## 2. 已确定的技术分层

| 层                  | 技术                                          | 责任                                                 |
| ------------------- | --------------------------------------------- | ---------------------------------------------------- |
| Desktop shell       | Tauri 2                                       | 窗口、打包、跨平台入口、IPC                          |
| Native/service core | Rust + Tokio                                  | 文件扫描、Git、命令发现、进程执行、OS 差异           |
| UI                  | React + TypeScript + Vite                     | 看板、详情、主题、布局和交互                         |
| Contract            | Serde DTO + TypeScript mirror                 | 保持前后端边界窄且可测试                             |
| Persistence         | localStorage + app-data JSON / SQLite（规划） | 偏好和第一版运行记录；后续承载多工作区与大规模历史   |
| Project protocol    | `.atrium/manifest.toml`（可选）               | 让项目主动声明平台、渠道和命令绑定，不影响无配置项目 |

Tauri 2 + React/TypeScript + Rust 已作为 Atrium 的实现方案确定。候选方案比较
和取舍依据保留在 [TECHNOLOGY_OPTIONS.md](TECHNOLOGY_OPTIONS.md) 中，便于未来
开源后解释架构决策，但不再作为一期实现的待决项。

## 3. 分层结构

```text
React UI
  ├─ App.tsx                页面编排、跨特性状态协调和 Tauri 生命周期
  ├─ app                   应用层持久化、消息格式化、外壳和页面组合
  │  ├─ AppSidebar          应用导航
  │  ├─ LocalActivityPanel  本地活动摘要
  │  └─ ProjectsPage        项目页布局组合
  ├─ features/projects      项目列表、详情、工作区扫描和项目交互
  │  ├─ project-list-model    列表筛选、排序和项目显示元数据
  │  ├─ workspace-snapshot    工作区快照指纹、合并和空快照
  │  ├─ ProjectInspector       详情页区块组合根
  │  │  ├─ ProjectRepositorySection    仓库事实
  │  │  ├─ ProjectToolsSection         项目工具与链接
  │  │  ├─ ProjectStorageSection       存储与清理
  │  │  ├─ ProjectContextSection       平台与渠道上下文
  │  │  ├─ ProjectBuildProfilesSection 构建配置与操作
  │  │  ├─ ProjectRunSection            活动运行输出
  │  │  └─ ProjectCommitsSection        近期提交
  │  ├─ use-project-workspace 工作区与项目选择组合根
  │  ├─ use-project-selection 选中项目状态与选择操作
  │  ├─ use-project-detail-lifecycle 详情异步读取、刷新和过期请求保护
  │  ├─ use-project-guidance-actions 协议引导与 Agent 提示词
  │  ├─ use-project-cleanup-actions 产物清理选择与执行
  │  ├─ git-presentation          Git 状态展示纯函数
  │  ├─ protocol-presentation     协议能力展示与决策纯函数
  │  ├─ command-presentation      命令与配置映射纯函数
  │  ├─ storage-presentation      存储与产物标签纯函数
  │  ├─ scan-request-gate         最新扫描请求优先的并发闸门
  │  ├─ ProjectListRow             列表行事件边界
  │  ├─ ProjectListRowCells        项目、Git、上下文和操作单元
  │  ├─ use-project-reorder        排序门面与预览顺序投影
  │  ├─ use-project-drag-session   HTML5 拖拽会话与落点反馈
  │  └─ use-workspace-scan-lifecycle 工作区扫描生命周期与刷新调度
  ├─ features/git           Git 历史页和提交列表
  │  ├─ GitHistoryView       Git 页面组合
  │  ├─ GitChangePanel       版本范围查询和变更摘要
  │  ├─ use-git-change-summary 查询状态与异步加载
  │  ├─ git-change-model      revision 候选与默认值纯函数
  │  └─ GitCommitTimeline    跨项目提交时间线
  ├─ features/runs          项目命令执行状态与事件订阅
  │  ├─ use-project-runner   命令触发、预览运行和活动运行选择
  │  ├─ use-run-event-stream 运行事件订阅和运行集合
  │  └─ run-output-buffer    按运行 ID 隔离且有界的输出缓冲纯函数
  ├─ features/settings      主题、布局、工作区偏好
  ├─ shared                 格式化和跨特性活动消息契约等无领域依赖代码
  │  ├─ format              时间、相对时间、字节和模板文本格式化
  │  ├─ activity            工作区/运行活动消息的共享契约
  │  └─ errors              统一的未知错误转用户可见文本规则
  └─ bridge                 类型化 Tauri invoke/event 与预览适配
       ├─ types.ts          兼容导出门面
       │  ├─ types/common   Facet、命令和配置状态基础类型
       │  ├─ types/project  项目与工作区 DTO
       │  ├─ types/protocol 协议与图标 DTO
       │  ├─ types/storage  存储、产物与清理 DTO
       │  ├─ types/git      Git DTO
       │  └─ types/run      运行事件与结果 DTO
       ├─ fake-bridge       预览适配兼容门面
       ├─ demo-data         确定性预览项目快照
       └─ demo-run          预览运行结果
       │
       ▼
Tauri command boundary
       │
       ▼
Rust native core
  ├─ command_boundary        阻塞 I/O 的统一异步边界与错误前缀
  ├─ workspace_commands      工作区、项目扫描和协议报告的 Tauri 适配器
  ├─ run_commands             运行控制和运行记录的 Tauri 适配器
  ├─ git_commands             Git 变更查询的 Tauri 适配器
  ├─ tool_commands            项目工具命令适配门面
  │  ├─ artifact               声明产物打开
  │  ├─ project                项目目录和终端打开
  │  └─ external               远程仓库和 manifest 链接打开
  ├─ model                   前后端共享的序列化领域 DTO 门面
  │  ├─ project               项目与工作区契约
  │  ├─ protocol              协议状态与报告契约
  │  ├─ storage               存储与清理契约
  │  ├─ git                   Git 快照与变更契约
  │  └─ run                   运行事件与结果契约
  ├─ scanner                 对外暴露扫描器边界
  ├─ os_open                 跨平台路径与 URL 打开适配
  ├─ project_metadata        项目名称和描述读取
  ├─ project_path            项目根路径、实路径包含和符号链接边界校验
  ├─ workspace_scan          工作区遍历和项目候选发现
  ├─ workspace_policy        确定性的排除目录与项目标记规则
  ├─ filesystem_metrics      文件/目录指标与符号链接安全策略
  ├─ project_scan            单项目快照组装和项目元数据读取
  ├─ command_discovery       确定性原生命令发现门面
  │  ├─ package               package.json scripts 适配
  │  ├─ toolchain             Cargo/Flutter/脚本入口适配
  │  ├─ makefile              Makefile target 适配
  │  └─ common                argv、标签和平台可执行文件规则
  ├─ manifest_schema         manifest DTO 与 TOML 解析
  ├─ manifest                配置文件读取、Schema 校验和入口编排
  ├─ manifest_projection    声明投影门面
  │  ├─ facets               平台/渠道声明
  │  ├─ profiles             构建配置与命令绑定
  │  ├─ cleanup               清理目录声明
  │  ├─ links                 工具和项目链接声明
  │  └─ path_policy           manifest 相对路径和受保护路径规则
  ├─ protocol                协议能力状态评估
  ├─ guidance                Agent 引导文件和报告生成门面
  │  ├─ configuration        项目配置引导报告
  │  └─ icon                 图标协议报告
  ├─ conformance              图标协议状态编排和事实读取
  │  └─ icon_assets            图标路径安全、格式校验和兼容发现
  ├─ git                     Git 领域门面
  │  ├─ snapshot             分支、工作区、上游和引用快照
  │  ├─ change_summary       版本范围、提交和文件变更统计
  │  ├─ commit               统一提交记录解析
  │  └─ command              Git CLI 执行边界
  ├─ artifacts               构建产物领域门面
  │  ├─ inspection            声明产物检查、计数和路径安全校验
  │  └─ opening               已声明产物的跨平台打开适配
  ├─ storage                 存储领域门面
  │  ├─ inspection            项目大小和 manifest 清理候选统计
  │  └─ cleanup               用户确认后的清理执行和结果
  ├─ runner                   运行编排、配置校验和运行上下文
  ├─ run_supervisor           子进程生命周期和取消监督
  │  ├─ output                stdout/stderr 读取、事件转发和输出汇总
  │  └─ outcome               进程结果到运行状态的纯策略判定
  ├─ state                    并发运行控制和应用状态
  └─ history                  应用数据目录中的运行记录和日志
```

UI 不直接读取文件系统，也不直接拼接 shell 命令。Rust 端不保存项目业务
阶段，不对项目内容做重写。

前端依赖方向是 `App → feature → bridge/shared`；项目特性之间通过类型化 props
和回调协作，不通过共享的页面级可变状态互相调用。Rust 的 `commands` 只负责
Tauri 输入校验、阻塞任务调度和错误边界，具体领域规则留在对应模块中。当前
仍有少量跨特性编排保留在 `App.tsx`，它是组合根，不承载扫描、执行或详情视图的
实现细节。

## 4. 核心领域模型

### ProjectSnapshot

```text
ProjectSnapshot
  id: stable local path identity
  name: directory or manifest name
  path: canonical repository path
  description: optional structured project description
  icon: optional data URL + repository-relative source path
  protocol: ProtocolStatus
  repo: GitSnapshot?
  tools: ProjectTools
  links: ProjectLink[]
  platforms: Facet[]
  channels: Facet[]
  buildProfiles: BuildProfile[]
  configuration: ProjectConfiguration
  commands: ProjectCommand[]
  cleanup: CleanupDeclaration
  storage: ProjectStorage?       # loaded by detail inspection; includes isComplete
  artifacts: BuildArtifact[]?    # loaded by detail inspection; metrics include isComplete
  scannedAt: timestamp
```

`ProtocolStatus` 是项目事实的可信度边界：

```text
ProtocolStatus
  manifestPath
  schema?
  manifestStatus: configured | missing | invalid
  capabilities: identity | context | build_profiles | cleanup
                 configured | partial | missing | invalid | legacy
```

平台、渠道和正式构建配置只有在对应能力通过确定性校验后才会进入可执行视图。
清理目录是可选能力；未声明时仍可展示项目大小，但不会产生清理目标。

项目展示名称也只来自确定性的结构化入口，优先级固定为
`package.json:name`、`Cargo.toml:[package].name`、`pubspec.yaml` 根级 `name`、
`pyproject.toml:[project].name` 或 Poetry 的 `[tool.poetry].name`；未找到有效字段时
才回退到仓库目录名。不会在任意文本、注释、嵌套配置或 Markdown 中搜索 `name`。

### Facet

平台和渠道都使用同一类事实模型，并且只接受 manifest 中的确定性声明：

```text
Facet
  key: stable identifier
  label: user-facing label
  source: configured
  evidence: repository-relative paths or manifest keys
```

不存在 manifest 时，列表为空并标记为 `missing`；Atrium 不从 README、Markdown、
CI 文本或目录名称猜测平台和渠道。

### BuildProfile

```text
BuildProfile
  id
  label
  platform: Facet
  channel: Facet
  runCommandId?
  checkCommandId?
  buildCommandId?
  source: manifest key
  region? / payment?  (reserved for later variants)
  artifacts: string[]             # explicit files or directories produced by this profile
  issues: string[]
```

BuildProfile 是“平台 + 渠道 + 项目命令绑定”的组合。对于正式的目标操作，
用户先选择配置，Atrium 再调用该配置绑定的仓库命令。

项目文件中自动发现的 `ProjectCommand` 则属于独立的仓库命令入口。它们不会
因为是否被 Profile 引用而被合并或过滤；用户确认显示后，可以直接执行其中
任意类型的命令。即使命令实际相同，业务语义仍然分开。

### ProjectCommand

```text
ProjectCommand
  id: stable detector id
  kind: run | check | build | other
  label: Run / Check / Build / ...
  program: executable name
  args: argv array
  workingDirectory: project path
  displayCommand: safe display string
  source: package.json / Makefile / Cargo.toml / ...
```

命令不是一段可任意执行的 shell 文本。扫描器只产生已知构建工具和项目配置
中的参数数组；未来的协议文件也必须经过同样的结构校验。

### Runtime records

运行状态属于一次命令执行，而不是项目生命周期：

```text
RunRecord
  runId
  projectId
  commandId
  projectPath
  profileId? / profileAction?
  platform? / channel?
  gitBranch? / gitCommit? / worktreeClean?
  startedAt
  finishedAt?
  status: running | succeeded | failed | cancelled
  exitCode?
  stdout/stderr?
```

The current durable implementation stores at most 100 finished records as JSON in
Atrium's application data directory. It writes a fully synced temporary file and
atomically replaces the history file, so a process interruption leaves either the
previous complete document or the new complete document. This is intentionally
separate from the project repository and can later migrate to SQLite without
changing the project-side protocol. Opening a log materializes a text file in the
same application data area; a project-scoped viewing surface remains a follow-up.
Each stdout/stderr stream is read through a fixed-size byte buffer, keeps at most
256 KiB for durable capture, and truncates individual lines at 16 KiB. The reader
continues draining the child pipe after a limit is reached, so noisy commands do
not grow memory without bound or deadlock the supervised process; the UI and log
receive a deterministic truncation marker.

当前不提供脱离项目上下文的独立运行记录页面。运行记录仍由执行核心持久化，记录中
始终包含项目、命令、平台/渠道和 Git 上下文；后续应在项目详情中按项目重新设计查看
入口，而不是复用全局选中项目状态。

看板不会出现 `Planning`、`Building`、`Improving` 之类的项目阶段字段。项目
列表只展示客观的 Git、扫描和命令结果。

跨项目管理偏好只保存在 Atrium 本地，不写回项目仓库：

```text
workspaces: string[]
excludeNames: string[]
projectMeta[path]: favorite | hidden | order
```

项目手动顺序是看板本地偏好中的显式事实。Projects 页面只有项目行左侧的拖拽手柄
可以启动排序；项目内容区域仍然只负责选中项目。拖拽过程中，UI 先在当前可见列表中
实时预览插入位置，用上下插入线提示 before/after；只有松手落在另一项目行上时才一次性
提交新的 `order`，落到列表外则取消预览，不会修改仓库文件。筛选后的项目重排只改变
这些可见项目之间的相对顺序，未显示项目会保留在完整手动顺序中的位置。非手动排序
模式不提供拖拽提交入口。

扫描器分别读取每个工作区，按 canonical project path 合并重复项目；无效工作区
不会阻塞其他工作区，重叠路径会作为扫描警告显示。工作区一级目录的符号链接只有在
解析后仍位于所选工作区内才会参与扫描，越出工作区的链接会被跳过；canonical project
path 会再次去重。

## 5. 扫描流程

```text
用户在 Settings 维护多个工作区
  → 并行枚举每个工作区一级目录
  → 判断 Git/manifest/project markers
  → 由 scanner 中的确定性适配器发现项目命令
  → 读取 Git 只读事实
  → 生成带 evidence 和 icon 的列表 snapshot
  → 先更新项目选中态
  → 通过独立 inspect command 异步读取选中项目详情
  → UI 补齐 Git、入口和提交信息
```

原生会话会以固定的轻量周期重复工作区扫描。扫描结果用稳定字段计算指纹，只有
项目事实变化时才替换列表；当前选中项目保持不变。用户也可以从检查器发起单项目
刷新，重新读取完整详情。磁盘统计不会进入周期扫描。

原生命令适配器保持独立，避免一个项目的命令规则污染其他项目：

- JavaScript/TypeScript：从 `package.json` 读取 scripts；
- Rust：从 `Cargo.toml` 提供 Cargo 入口；
- Flutter：从 `pubspec.yaml` 提供 Flutter 入口；
- Make：从 `Makefile` 读取明确 target；
- 脚本名和 Make target 只接受不含空白/控制字符、不以 `-` 开头且不超过 128 字节的
  标识符；异常键会被忽略，避免污染 UI、source 引用或 argv；
- 平台与渠道：只从 `.atrium/manifest.toml` 读取，不从 workflow、目录名称或文档推断。
- Schema 1 的 manifest 结构严格拒绝所有未声明字段；拼写错误或未来版本字段会使配置无效，
  不会被静默忽略。
- package.json、Cargo.toml、pyproject.toml、pubspec.yaml、Makefile 和
  `.atrium/manifest.toml` 等固定项目描述文件统一经过项目根路径边界读取；缺失、不可读和
  符号链接不是同一种状态，项目外部或经由符号链接到达的描述文件不会成为 Atrium 事实。
- Atrium 生成的协议引导报告也经过同一项目路径边界写入；会逐级创建并校验普通目录，拒绝
  通过符号链接写入项目外部，避免报告生成意外覆盖仓库之外的文件。

Atrium 协议是项目上下文的上游接入门槛。只有 icon.v1 声明处于 compliant 状态时，
界面才把平台、渠道和构建 Profile 作为已接入项目事实展示；协议未就绪时只显示等待
接入的说明，不把扫描结果伪装成可信配置。

没有 manifest 或没有有效 build profile 时显示未声明/无效，并提供生成结构化配置说明的
操作；不猜测商店、支付或发布渠道。仓库命令仍然可以从项目文件中确定性发现，默认
隐藏具体列表，用户明确确认后可执行；它们不能被当作平台/渠道操作。命令执行失败
由项目和当前运行环境决定，Atrium 只负责返回执行结果。

引导操作一次生成项目配置说明和图标协议说明两个 Agent-facing 文件，界面只暴露一个
统一入口，避免用户理解两个独立修复流程。生成成功后，Atrium 同时生成一段固定模板的
项目开发 Agent 提示词，用户可以复制该提示词，让 Agent 读取这两个引导文件并完成项目配置。

项目存储统计和清理同样遵循项目声明：`[cleanup]` 中的 `cache` 与 `build`
数组由项目开发 Agent 根据真实模板补齐。Rust 核心只统计项目目录中的文件大小，
并在详情页异步展示；清理命令只接受 manifest 中声明、位于项目目录内且不是符号链接的
目录；父子重叠的清理声明会被判为无效，路径比较不区分大小写以兼容不同文件系统，避免统计
重复和重复处理。清理和产物访问还会
检查解析后的真实路径，拒绝越过项目根目录或穿过符号链接。
统计结果同时带有完整性标记：遇到无法读取的目录项时，Atrium 展示已读取的部分
数值并明确提示，不把部分统计伪装成精确总量。工作区总览不递归计算这些目录，避免扫描
大仓库时阻塞项目列表。

构建产物统计只在详情检查中执行，并且只读取当前 manifest 的
`build_profiles[].artifacts`。声明可以指向文件或目录；不存在的声明显示为缺失，
不会被解释为构建失败。目录大小和最近修改时间只统计真实文件，不跟随符号链接；目录
递归无法完整读取时，产物指标带有 `isComplete = false`。

图标检测优先使用项目 manifest 和 Tauri/Unity 常见位置，再在有限目录深度内
查找 `icon` / `logo` 文件；仅读取小于 512 KB 的 png、svg、jpeg、webp、ico
文件，避免扫描阶段把大型构建产物带入快照。

项目工具和链接只来自结构化 manifest 字段。打开目录、终端、远程仓库或声明链接时
由 Rust 原生命令执行；没有项目终端声明时直接使用操作系统默认终端。Atrium 不提供
让用户填写终端命令的设置，编辑器入口也暂不提供。UI 不拼接 shell 文本。清理选择
会在 Rust 端再次与 manifest 声明求交集后才允许删除。

## 6. Git 边界

Git CLI 是第一期的事实来源，因为用户现有项目的 Git 体系不需要改变，也不
需要在 Atrium 内复制 Git 实现。Atrium 只调用只读命令：

- `git rev-parse`：仓库识别和当前分支；
- `git status --porcelain`：工作区干净/有修改和未提交变更数量；
- `git remote get-url origin`：远程地址；
- `git log`：近期提交；
- `git for-each-ref`：可选择的分支和 Tag 引用；
- `git diff`：用户选择的两个安全 revision 之间的文件统计；
- `git rev-list --left-right --count @{upstream}...HEAD`：相对于本地上游跟踪分支的领先/落后提交数量；
  没有上游分支时显示未设置上游，不伪造为零。

用户请求的 Git 变更摘要会并行排空 stdout/stderr，并分别限制为 4 MiB/64 KiB；超出限制时
返回明确错误，要求缩小变更范围，不会截断后继续生成不完整摘要。轻量项目快照仍只读取
固定数量的近期记录和引用。

后续生成更新日志时，直接以快照中的 commit 范围和提交记录为输入。

## 7. 跨平台进程策略

- 使用 Rust `Command` / `tokio::process::Command`，不经过用户默认 shell；
- Windows 对 npm 使用 `npm.cmd`，其他工具通过 PATH 解析；
- macOS/Linux 使用 `npm`、`cargo`、`flutter` 等 PATH 工具；
- 工作目录始终是项目根目录；
- 命令显示文本与实际 argv 分开，显示文本不再解析执行；
- 运行器后续增加更完整的进程监督、取消、输出流和 Windows process tree 清理；
- 工具不存在、权限不足、退出码非零都作为明确的运行结果返回。

## 8. 持久化策略

第一批使用应用本地存储保存显示偏好和当前工作区路径：

```text
atrium.preferences.v1
  theme
  layout
  language
  rootPath
  workspaces
  excludeNames
  projectMeta
```

它不写入任何项目仓库。后续再使用应用数据目录下的 SQLite：

```text
workspace_roots
projects
project_facets
project_commands
scan_runs
git_snapshots
run_records
preferences
```

仓库源文件和 Git 不受 Atrium 数据库反向写入。扫描缓存必须可丢弃并重新
生成；用户手动配置和显示偏好才需要迁移。

## 9. 主题和布局

主题只改变设计 token，不改变领域数据：

- Deep Ocean
- Mist Silver
- Warm Ink

布局只改变数据排列，不增加项目语义：

- Overview：项目列表 + 详情检查器；
- Platform Matrix：按平台和渠道事实筛选。

Settings 页面提供持久化的主题、布局、语言和工作区扫描设置。项目切换时
选中高亮不等待扫描完成，右侧检查器显示异步加载骨架，避免首次打开项目阻塞
整个看板。

任何未来的 `Now / Next / Later` 都只能作为用户自定义视图或标签，不能成为
ProjectSnapshot 的固定字段。

## 10. 演进路线

1. 当前：扫描、Git、协议能力状态、检测器、命令发现、跨项目管理 UI；
2. 当前批次：多工作区、项目终端/链接入口、声明清理预览和 Git 版本差异；
3. 后续：SQLite 迁移、产物变化历史和更新日志生成；
4. 网站同步与发布相关能力作为独立适配器，不进入核心扫描模型。
