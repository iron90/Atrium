# Atrium Technical Architecture

## 1. Positioning and Phase-One Boundary

Atrium is a local-first visual project board spanning multiple projects. It discovers
projects, presents project facts, invokes entry points the projects already own, and
records local observation results; it does not prescribe a development process for
projects.

Phase-one goals:

- Scan the workspace directories the user selected and discover the project repositories
  inside them;
- Obtain platforms, channels, and build profiles from the deterministic declarations in
  `.atrium/manifest.toml`;
- Discover `Run`, `Check`, and `Build` entry points from the project's existing
  configuration;
- Invoke these entry points with safe argument arrays;
- Read Git branch, worktree status, remote URL, and recent commits;
- Find existing project icons in the repository and reuse them in the list and detail
  views;
- Provide a switchable English/Chinese UI and a reachable Settings page;
- Present the facts above on a board with multiple themes and layouts.

Phase-one non-goals:

- Website Server push and remote website synchronization;
- Payments, subscriptions, and store account connections;
- Git commit, tag, push, or any other history rewriting;
- A universal project `Stage` or project lifecycle management;
- Copying templates or creating project scaffolds through Atrium;
- Development Agent orchestration, chat, or task management.

## 2. Settled Technology Layers

| Layer               | Technology                                      | Responsibility                                                                                                           |
| ------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Desktop shell       | Tauri 2                                         | Window management, packaging, cross-platform entry, IPC                                                                  |
| Native/service core | Rust + Tokio                                    | File scanning, Git, command discovery, process execution, OS differences                                                 |
| UI                  | React + TypeScript + Vite                       | Board, detail, themes, layouts, and interaction                                                                          |
| Contract            | Serde DTO + TypeScript mirror                   | Keep the frontend/backend boundary narrow and testable                                                                   |
| Persistence         | localStorage + app-data JSON / SQLite (planned) | Preferences and first-version run history; later hosts multi-workspace and large-scale history                           |
| Project protocol    | `.atrium/manifest.toml` (optional)              | Lets projects proactively declare platform, channel, and command bindings; projects without configuration are unaffected |

Tauri 2 + React/TypeScript + Rust is settled as Atrium's implementation stack. The
candidate options and their trade-offs were evaluated before implementation; they are
settled decisions, no longer open items for phase-one.

## 3. Layered Structure

```text
React UI
  ├─ App.tsx                Page orchestration, cross-feature state coordination, and the Tauri lifecycle
  ├─ app                    App-level persistence, message formatting, shell, and page composition
  │  ├─ AppSidebar          App navigation
  │  ├─ LocalActivityPanel  Global run status summary in the left sidebar
  │  ├─ PageTransition      Tab keep-alive, idle preloading, and exit-view freezing
  │  └─ ProjectsPage        Projects page layout composition
  ├─ features/projects      Project list, detail, workspace scanning, and project interactions
  │  ├─ project-list-model  List filtering, sorting, and project display metadata
  │  ├─ workspace-snapshot  Workspace snapshot fingerprints, merging, and empty snapshots
  │  ├─ ProjectInspector    Detail page section composition root
  │  │  ├─ ProjectRepositorySection      Repository facts
  │  │  ├─ ProjectToolsSection           Project tools and links
  │  │  ├─ ProjectStorageSection         Storage and cleanup
  │  │  ├─ ProjectContextSection         Platform and channel context
  │  │  ├─ ProjectBuildProfilesSection   Build profiles and actions
  │  │  ├─ ProjectRunSection             Active run output
  │  │  └─ ProjectCommitsSection         Recent commits
  │  ├─ use-project-workspace        Workspace and project selection composition root
  │  ├─ use-project-selection        Selected project state and selection actions
  │  ├─ use-project-detail-lifecycle Async detail reads, refreshes, and stale-request protection
  │  ├─ use-project-guidance-actions Protocol guidance and Agent prompts
  │  ├─ use-project-cleanup-actions  Artifact cleanup selection and execution
  │  ├─ git-presentation             Pure functions for Git status presentation
  │  ├─ protocol-presentation        Pure functions for protocol capability presentation and decisions
  │  ├─ command-presentation         Pure functions for command and profile mapping
  │  ├─ storage-presentation         Pure functions for storage and artifact labels
  │  ├─ scan-request-gate            Concurrency gate that prioritizes the latest scan request
  │  ├─ ProjectListRow               List row event boundary
  │  ├─ ProjectListRowCells          Project, Git, context, and action cells
  │  └─ use-workspace-scan-lifecycle Workspace scan lifecycle and refresh scheduling
  ├─ features/git           Git history page and commit list
  │  ├─ GitHistoryView      Git page composition
  │  ├─ GitChangePanel      Revision range queries and change summaries
  │  ├─ use-git-change-summary  Query state and async loading
  │  ├─ git-change-model    Pure functions for revision candidates and defaults
  │  └─ GitCommitTimeline   Cross-project commit timeline
  ├─ features/runs          Project command execution state and event subscriptions
  │  ├─ use-project-runner  Command triggering, preview runs, and active run selection
  │  ├─ use-run-event-stream  Run event subscription and the run collection
  │  └─ run-output-buffer   Pure functions for output buffering, isolated per run ID and bounded
  ├─ features/settings      Theme, layout, and workspace preferences
  ├─ shared                 Domain-independent code such as formatting and cross-feature activity message contracts
  │  ├─ format              Time, relative time, byte, and template text formatting
  │  ├─ activity            Shared contracts for workspace/run activity messages
  │  └─ errors              Unified rules for turning unknown errors into user-visible text
  └─ bridge                 Typed Tauri invoke/event and preview adapters
       ├─ types.ts          Compatibility export facade
       │  ├─ types/common   Base types for facets, commands, and configuration state
       │  ├─ types/project  Project and workspace DTOs
       │  ├─ types/protocol Protocol and icon DTOs
       │  ├─ types/storage  Storage, artifact, and cleanup DTOs
       │  ├─ types/git      Git DTOs
       │  └─ types/run      Run event and result DTOs
       ├─ fake-bridge       Preview adapter compatibility facade
       ├─ demo-data         Deterministic preview project snapshots
       └─ demo-run          Preview run results
       │
       ▼
Tauri command boundary
       │
       ▼
Rust native core
  ├─ command_boundary       Unified async boundary for blocking I/O and error prefixes
  ├─ workspace_commands     Tauri adapters for workspaces, project scans, and protocol reports
  ├─ run_commands           Tauri adapters for run control and run history
  ├─ git_commands           Tauri adapters for Git change queries
  ├─ tool_commands          Adapter facade for project tool commands
  │  ├─ artifact            Opening declared artifacts
  │  ├─ project             Opening project directories and terminals
  │  └─ external            Opening remote repositories and manifest links
  ├─ model                  Facade of serialized domain DTOs shared between frontend and backend
  │  ├─ project             Project and workspace contracts
  │  ├─ protocol            Protocol status and report contracts
  │  ├─ storage             Storage and cleanup contracts
  │  ├─ git                 Git snapshot and change contracts
  │  └─ run                 Run event and result contracts
  ├─ scanner                Public scanner boundary
  ├─ os_open                Cross-platform path and URL opening adapter
  ├─ project_metadata       Project name and description reads
  ├─ project_path           Project root paths, real-path containment, and symlink boundary validation
  ├─ workspace_scan         Workspace traversal and project candidate discovery
  ├─ workspace_policy       Deterministic excluded-directory and project marker rules
  ├─ filesystem_metrics     File/directory metrics and symlink-safe policies
  ├─ project_scan           Single-project snapshot assembly and project metadata reads
  ├─ command_discovery      Deterministic native command discovery facade
  │  ├─ package             package.json scripts adapter
  │  ├─ toolchain           Cargo/Flutter/script entry adapters
  │  ├─ makefile            Makefile target adapter
  │  ├─ dotnet              .NET run/build/test entry adapters
  │  ├─ go                  Go run/build/test entry adapters
  │  ├─ gradle              Gradle build entry adapters
  │  ├─ maven               Maven build entry adapters
  │  ├─ python              Python test/build entry adapters (including uv)
  │  ├─ elixir              Mix entry adapters
  │  ├─ ecosystem           Ecosystem registry that dispatches adapters by project file
  │  └─ common              argv, label, and platform-specific executable rules
  ├─ manifest_schema        Manifest DTOs and TOML parsing
  ├─ manifest               Manifest file reading, schema validation, and entry orchestration
  ├─ manifest_projection    Declaration projection facade
  │  ├─ facets              Platform/channel declarations
  │  ├─ profiles            Build profiles and command bindings
  │  ├─ cleanup             Cleanup directory declarations
  │  ├─ links               Tool and project link declarations
  │  └─ path_policy         Manifest-relative path and protected path rules
  ├─ protocol               Protocol capability status evaluation
  ├─ guidance               Agent guidance file and report generation facade
  │  ├─ configuration       Project configuration guidance report
  │  └─ metadata            guidance.toml metadata and sync status
  ├─ conformance            Icon protocol status orchestration and fact reading
  │  └─ icon_assets         Icon path safety, format validation, and compatibility discovery
  ├─ git                    Git domain facade
  │  ├─ snapshot            Branch, worktree, upstream, and ref snapshots
  │  ├─ change_summary      Revision ranges, commits, and file change statistics
  │  ├─ commit              Unified commit record parsing
  │  └─ command             Git CLI execution boundary
  ├─ artifacts              Build artifact domain facade
  │  ├─ inspection          Declared artifact inspection, counting, and path safety validation
  │  └─ opening             Cross-platform opening for declared artifacts
  ├─ storage                Storage domain facade
  │  ├─ inspection          Project size and manifest cleanup candidate statistics
  │  └─ cleanup             Cleanup execution and results after user confirmation
  ├─ runner                 Run orchestration, profile validation, and run context
  ├─ run_supervisor         Child process lifecycle and cancellation supervision
  │  ├─ output              stdout/stderr reads, event forwarding, and output summaries
  │  └─ outcome             Pure policy mapping from process results to run status
  ├─ state                  Concurrent run control and application state
  └─ history                Run history and logs in the application data directory
```

The UI does not read the filesystem directly and does not concatenate shell commands.
The Rust side does not store project business stages and does not rewrite project
content.

The frontend dependency direction is `App → feature → bridge/shared`; project features
collaborate through typed props and callbacks, not by calling each other through shared
page-level mutable state. Rust `commands` only handle Tauri input validation, blocking
task scheduling, and error boundaries; concrete domain rules stay in their own modules.
A small amount of cross-feature orchestration still lives in `App.tsx`; it is the
composition root and does not carry the implementation details of scanning, execution,
or detail views.

Tabs separate the Model and View lifecycles. Models such as workspace snapshots,
project details, and run events keep updating at the app layer and do not stop when
tabs switch; `PageTransition` maintains a long-lived View host for each tab. A tab in
the background keeps receiving fresh data while hidden; when a tab starts exiting, its
current View snapshot is frozen, so async detail loads, list changes, or other Model
updates cannot trigger layout changes during the animation. After the exit animation
completes, React cleanup is not run on the final frame; the old View remains as a
transparent layer outside the layout until the next navigation reuses it. Re-entering
a tab restores the view from the latest Model snapshot instead of remounting the whole
page tree.

## 4. Core Domain Model

### ProjectSnapshot

```text
ProjectSnapshot
  id: stable local path identity
  name: directory or manifest name
  path: canonical repository path
  modifiedAt: optional last activity time (latest commit, or directory mtime without Git)
  description: optional structured project description
  icon: optional data URL + repository-relative source path
  iconConformance: declared icon path safety and format status
  protocol: ProtocolStatus
  guidance: GuidanceStatus (guidance revision with needsUpdate/needsSync)
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

`ProtocolStatus` is the trust boundary for project facts:

```text
ProtocolStatus
  manifestPath
  schema?
  manifestStatus: configured | missing | invalid
  capabilities: identity | context | build_profiles | cleanup
                 configured | partial | missing | invalid | legacy
```

Platforms, channels, and formal build profiles appear in the actionable view only
after the corresponding capability passes deterministic validation. Cleanup
directories are an optional capability; when they are not declared, project size can
still be shown, but no cleanup targets are produced.

The project display name likewise comes only from deterministic structured entry
points, with a fixed priority: `package.json:name`, `Cargo.toml:[package].name`, the
root-level `name` in `pubspec.yaml`, `pyproject.toml:[project].name`, or Poetry's
`[tool.poetry].name`; only when none of these fields is valid does it fall back to the
repository directory name. `name` is never searched for in arbitrary text, comments,
nested configuration, or Markdown.

### Facet

Platforms and channels share one fact model and accept only deterministic declarations
from the manifest:

```text
Facet
  key: stable identifier
  label: user-facing label
  source: configured
  evidence: repository-relative paths or manifest keys
```

When no manifest exists, the lists are empty and marked `missing`; Atrium never
guesses platforms and channels from READMEs, Markdown, CI text, or directory names.

### BuildProfile

```text
BuildProfile
  id
  label
  platform: Facet
  channel: Facet
  checkCommandId?
  buildCommandId?
  runCommandId?
  hostRequirements: { check?: HostOs[]; build?: HostOs[]; run?: HostOs[] }
  verification: { check?: HostOs[]; build?: HostOs[]; run?: HostOs[] }
  hostMismatchActions / unverifiedActions
  source: manifest key
  region? / payment?  (reserved for later variants)
  artifacts: string[]             # explicit files or directories produced by this profile
  issues: string[]
```

A BuildProfile is the combination of "platform + channel + project command bindings".
For a formal target action, the user first selects a profile, and Atrium then invokes
the repository command bound to that profile. Those actions are presented and
discussed in workflow order: check, then build, then run.

`hostRequirements` is the per-action lower bound of host compatibility (the
environments where execution is allowed), not a verification conclusion; `verification`
is the per-action upper-bound evidence of "hosts where the action has been verified to
succeed". A project Agent may write a host into `verification` only after fully
executing the same command on that host and meeting the success postconditions such as
the final exit code, target startup, or actual build artifacts. The target platform,
target triple, runner name, tool availability, or a successful intermediate step is
not proof. A host mismatch is "deferred verification", not a failure, and it must not
lead to removing a command binding or a host requirement. Atrium reads `verification`
only as a structured declaration in the manifest and gates execution on it; it neither
certifies nor re-tests, and the project Agent is responsible for its accuracy.

`ProjectCommand` entries discovered automatically from project files are separate
repository command entry points. They are neither merged nor filtered based on whether
a profile references them; after the user confirms they should be displayed, commands
of any kind can be executed directly. Even when the underlying command is identical,
the business semantics remain separate.

### ProjectCommand

```text
ProjectCommand
  id: stable detector id
  kind: check | build | run | other
  label: Check / Build / Run / ...
  program: executable name
  args: argv array
  workingDirectory: project path
  displayCommand: safe display string
  source: package.json / Makefile / Cargo.toml / ...
```

A command is never a piece of shell text that can be executed arbitrarily. The scanner
produces argument arrays only from known build tools and project configuration; future
protocol files must pass through the same structural validation.

### Runtime records

Run status belongs to an individual command execution, not to a project lifecycle:

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
Atrium's application data directory. Loading also rejects a history file larger
than 64 MiB before reading it into memory, so corrupted or unexpectedly expanded
application data fails explicitly instead of becoming an unbounded allocation. It
writes a fully synced temporary file and atomically replaces the history file, so a
process interruption leaves either the previous complete document or the new
complete document. This is intentionally
separate from the project repository and can later migrate to SQLite without
changing the project-side protocol. Opening a log materializes its text file in the
same application data area with the same atomic replacement policy. The project
inspector includes a per-project history section showing the 12 most recent runs
with log access; a standalone cross-project history page remains a follow-up.
Each stdout/stderr stream is read through a fixed-size byte buffer, keeps at most
256 KiB for durable capture, and truncates individual lines at 16 KiB. The reader
continues draining the child pipe after a limit is reached, so noisy commands do
not grow memory without bound or deadlock the supervised process; the UI and log
receive a deterministic truncation marker.
Run IDs are validated as bounded, separator-free, non-control identifiers before
the stop registry or persisted history is accessed.

Project storage statistics cache metrics for every path level in a single pass; the
declared size of a cleanup directory reuses that cache directly, avoiding a second
recursive scan of large caches or build directories. The cache keeps only
directory-level metrics, lives only for the current inspection, and does not affect
the timeliness of the next scan.

The project detail inspector provides a run history entry filtered per project; the
12 most recent runs and their log text are viewed directly in the project context. A
standalone run history page outside the project context is out of scope for now. Run
history is still persisted by the execution core, and every record always includes
the project, command, platform/channel, and Git context.

The board never shows project stage fields such as `Planning`, `Building`, or
`Improving`. The project list shows only objective Git, scan, and command results.

Cross-project management preferences are stored only locally in Atrium and are never
written back to project repositories:

```text
workspaces: string[]
excludeNames: string[]
projectMeta[path]: favorite | hidden
```

Favoriting and hiding are local board display preferences only and are never written
back to project repositories. Project list sorting is derived from the current scan
snapshot and supports name, Git status, last modified, and disk usage; sorting never
modifies project files and never changes Git history.

The scanner reads each workspace separately and merges duplicate projects by
canonical project path; an invalid workspace never blocks other workspaces, and
overlapping paths are shown as scan warnings. Symlinks in a workspace's top-level
directories participate in scanning only if they still resolve inside the selected
workspace; links reaching outside the workspace are skipped, and canonical project
paths are deduplicated again.

## 5. Scan Flow

```text
The user maintains multiple workspaces in Settings
  → enumerate each workspace's top-level directories in parallel
  → evaluate Git/manifest/project markers
  → deterministic adapters in the scanner discover project commands
  → read read-only Git facts
  → produce a list snapshot with evidence and icon
  → update the project selection state first
  → read the selected project's details asynchronously via a separate inspect command
  → the UI fills in Git, entry point, and commit information
```

The native session repeats the workspace scan at a fixed, lightweight interval. Scan
results are fingerprinted using stable fields, and the list is replaced only when
project facts change; the currently selected project stays unchanged. The user can
also trigger a single-project refresh from the inspector to re-read the full details.
Disk statistics never enter the periodic scan.

Native command adapters stay independent so one project's command rules cannot
pollute another project's:

- JavaScript/TypeScript: reads scripts from `package.json`;
- Rust: provides Cargo entry points from `Cargo.toml`;
- Flutter: provides Flutter entry points from `pubspec.yaml`;
- Make: reads explicit targets from `Makefile`;
- .NET: discovers `dotnet test` / `build` / `run` from `.sln` / `.csproj`;
- Go: discovers `go test` / `build` / `run` from `go.mod`;
- Gradle: discovers Gradle entry points from `build.gradle(.kts)` / `settings.gradle(.kts)`;
- Maven: discovers Maven entry points from `pom.xml`;
- Python: discovers pytest and build entry points from `pyproject.toml` / `requirements.txt` (uv supported);
- Elixir: discovers Mix entry points from `mix.exs`;
- Script names and Make targets accept only identifiers without whitespace or control
  characters, not starting with `-`, and no longer than 128 bytes; anomalous keys are
  ignored so they cannot pollute the UI, source references, or argv;
- Platforms and channels: read only from `.atrium/manifest.toml`, never inferred from
  workflows, directory names, or documents;
- The manifest structure strictly rejects every undeclared field; a typo or a
  future-version field invalidates the configuration instead of being silently
  ignored. The current schema is 1 and already includes per-action host system
  declarations for Check / Build / Run (host_requirements) and host verification
  records (verification); future protocol evolution must introduce a new schema
  number before adding fields;
- Fixed project description files such as package.json, Cargo.toml, pyproject.toml,
  pubspec.yaml, Makefile, and `.atrium/manifest.toml` are all read through the
  project root path boundary; missing, unreadable, and symlinked are not the same
  state, and a description file outside the project or reached through a symlink
  never becomes an Atrium fact;
- Protocol guidance reports generated by Atrium are written through the same project
  path boundary; ordinary directories are created and validated level by level, and
  writes reaching outside the project through symlinks are rejected, so report
  generation cannot accidentally overwrite files outside the repository.

The Atrium protocol is the upstream onboarding gate for project context. Only when
the manifest and the project icon declaration are in a usable state does the UI
present platforms, channels, and build profiles as onboarded project facts; while the
protocol is not ready, the UI shows only an explanation that onboarding is pending
and never disguises scan results as trusted configuration. Icons follow the project's
own formats and specifications; no unified icon standard is imposed.

When there is no manifest or no valid build profile, the UI shows undeclared/invalid
and offers an action that generates structured configuration guidance; it never
guesses store, payment, or release channels. Repository commands can still be
discovered deterministically from project files; the concrete list is hidden by
default and becomes executable only after the user explicitly confirms. They must not
be treated as platform/channel actions. Command execution failures are determined by
the project and the current execution environment; Atrium only returns the execution
result.

In one pass, the guidance action generates a single Agent-facing configuration file
containing the project configuration and icon instructions, plus an internal version
metadata file. After generation succeeds, Atrium also produces a fixed-template
prompt for the project development Agent; the user can copy that prompt so the Agent
reads the two guidance files and completes the project configuration.

A project Agent's verification can be affected by port occupancy, dependencies,
credentials, or toolchain state. Such environment blockers must not be treated as the
project not supporting the action, and they must not be bypassed by deleting command
bindings, narrowing the check scope, or faking host systems;
`.atrium/guidance-sync.toml` must not be updated while a blocker is unresolved.
Atrium's own development port is separate from the Tauri default port, so a project
Agent verifying other Tauri projects does not run into unrelated conflicts.

Project storage statistics and cleanup likewise follow the project's declarations:
the `cache` and `build` arrays in `[cleanup]` are completed by the project
development Agent based on real templates. The Rust core only counts file sizes
inside the project directory and shows them asynchronously on the detail page.
Cleanup commands accept only directories declared in the manifest, located inside
the project directory, and not symlinks; cleanup declarations whose parent and child
overlap are judged invalid, and path comparison is case-insensitive for
cross-filesystem compatibility, preventing double counting and double processing.
Cleanup and artifact access also check the resolved real path and reject anything
that escapes the project root or passes through symlinks. Statistics carry a
completeness marker: when a directory entry cannot be read, Atrium shows the
partially read value with an explicit notice and never presents partial statistics
as an exact total. The workspace overview does not recurse into these directories,
so scanning large repositories does not block the project list.

Build artifact statistics run only in the detail inspection and read only the
current manifest's `build_profiles[].artifacts`. Declarations may point to files or
directories; a declaration whose target does not exist is shown as missing and is
never interpreted as a build failure. Directory size and last-modified time count
only real files and never follow symlinks; when a directory cannot be fully read
recursively, the artifact metrics carry `isComplete = false`. When the accumulated
size or file count overflows, the metric saturates at `u64::MAX` and is likewise
marked incomplete, so a wrong exact value is never shown after overflow. When
recursion depth exceeds a fixed cap, reading stops going deeper and the result is
marked incomplete, so an abnormal directory tree cannot exhaust the call stack.

Icon detection prefers the project manifest and common Tauri/Unity locations, then
searches for `icon` / `logo` files within a limited directory depth; only png, svg,
jpeg, webp, and ico files smaller than 8 MiB are read, and compatibility discovery
keeps at most 64 candidates, so large build artifacts are not pulled into the
snapshot during scanning.

Project tools and links come only from structured manifest fields. Opening
directories, terminals, remote repositories, or declared links is performed by Rust
native commands; when no project terminal is declared, the operating system's
default terminal is used directly. Atrium provides no setting that lets users enter
a terminal command, and an editor entry point is not provided yet. The UI does not
concatenate shell text. A cleanup selection is intersected with the manifest
declarations again on the Rust side before deletion is allowed.

## 6. Git Boundary

The Git CLI is the phase-one source of truth because users' existing project Git
setups do not need to change and Git does not need to be reimplemented inside
Atrium. Atrium invokes only read-only commands:

- `git rev-parse`: repository identification and the current branch;
- `git status --porcelain`: clean/dirty worktree status and the number of uncommitted
  changes;
- `git remote get-url origin`: the remote URL;
- `git log`: recent commits;
- `git for-each-ref`: selectable branch and tag refs;
- `git diff`: file statistics between two user-selected, safe revisions;
- `git rev-list --left-right --count @{upstream}...HEAD`: ahead/behind commit counts
  relative to the local upstream tracking branch;
  when there is no upstream branch, the UI shows that no upstream is set instead of
  faking zero.

Read-only branch inspection extends from the same boundary: the detail panel can
select any local branch to view its commit list and its ahead/behind relative to the
checked-out HEAD (`git rev-list --left-right --count HEAD...<branch>`), but Atrium
**never performs a checkout, never modifies any ref, and never touches the
worktree**. Worktree status, the current branch, and the dirty count always describe
only the actually checked-out branch; the project list likewise shows only the real
HEAD. Branch selection is a viewing perspective inside the inspector and resets when
the project changes. This keeps worktree ownership with the project development
Agent, so the observation perspective and repository state cannot interfere with each
other.

Git commands uniformly drain stdout/stderr in parallel, with limits of 4 MiB/64 KiB
respectively; when a user-requested change summary exceeds the limit, a clear error
is returned asking to narrow the revision range, and no truncated, incomplete summary
is produced. The lightweight project snapshot marks worktree status unavailable when
the status output exceeds the limit or cannot be read, never reporting empty output
as clean; recent commits are still read only up to a fixed count.

When changelog generation comes later, it takes the commit range and commit records
in the snapshot directly as input.

## 7. Cross-Platform Process Policy

- Uses Rust `Command` / `tokio::process::Command`, never the user's default shell;
- On Windows, npm uses `npm.cmd`; other tools resolve through PATH;
- On macOS/Linux, PATH tools such as `npm`, `cargo`, and `flutter` are used;
- The working directory is always the project root;
- The command display text is kept separate from the actual argv; display text is
  never parsed for execution;
- The runner will later gain more complete process supervision, cancellation, output
  streaming, and Windows process tree cleanup;
- A missing tool, insufficient permissions, and a non-zero exit code are all returned
  as explicit run results.

## 8. Persistence Policy

The first batch uses application local storage to save display preferences and the
current workspace paths:

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

It never writes to any project repository. Preferences are non-factual input for
display and workspace entry; reads and writes are both capped at 256 KiB. The
workspace/excluded name lists keep at most 128 entries, single strings are at most
4096 characters, and project metadata keeps at most 2048 entries. Payloads beyond
the boundary never replace existing preferences, and list entries beyond the boundary
are ignored, so corrupted local storage cannot cause unbounded parsing or state bloat
at startup. Later comes SQLite under the application data directory:

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

Repository source files and Git are never written back to by the Atrium database.
The scan cache must remain discardable and regenerable; only user manual
configuration and display preferences need migration.

## 9. Themes and Layouts

Themes change only design tokens, never domain data:

- Deep Ocean
- Mist Silver
- Warm Ink

Layouts change only data arrangement and add no project semantics:

- Overview: project list + detail inspector;
- Platform Matrix: filtered by platform and channel facts.

The Settings page provides persistent theme, layout, language, and workspace scan
settings. When switching projects, the selection highlight does not wait for a scan
to finish; the inspector on the right shows an async loading skeleton, so opening a
project for the first time does not block the whole board.

Any future `Now / Next / Later` can only be a user-defined view or label and can
never become a fixed ProjectSnapshot field.

### UI language and diagnostics

UI copy (themes, buttons, headings, and other UI chrome) follows the bilingual
(en/zh) i18n strings, while backend-produced diagnostics such as scan warnings,
manifest issues, and run errors, along with protocol guidance reports and the
AGENTS.md managed block, uniformly use English as the protocol and diagnostics
language. The integration prompt is still provided in both English and Chinese, but
the referenced report section headings keep their original English. This is a
deliberate decision: it avoids building an i18n channel for backend error strings
and guarantees that a development Agent reads consistent protocol text regardless of
the host language.

## 10. Evolution Roadmap

1. Current: scanning, Git, protocol capability status, detectors, command discovery, and the cross-project management UI;
2. Current batch: multiple workspaces, project terminal/link entry points, declared cleanup preview, and Git revision diffs;
3. Later: SQLite migration, artifact change history, and changelog generation;
4. Website synchronization and release-related capabilities remain separate adapters and do not enter the core scan model.
