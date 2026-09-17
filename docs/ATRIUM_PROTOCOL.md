# Atrium Project Integration Protocol

Atrium uses a small, deterministic project-side contract so each repository's
native configuration remains authoritative while Atrium can identify and
validate a project consistently.

## Manifest location

The optional project manifest is committed with the repository:

```text
.atrium/manifest.toml
```

The manifest is integration metadata owned by Atrium. It does not replace or
override `package.json`, `Cargo.toml`, `pubspec.yaml`, Unity project settings,
or any framework's build and release configuration.

## Capability status

Atrium evaluates the manifest and the project icon declaration into four
independent capabilities. The result is stored in the scan snapshot and is
never inferred from guidance Markdown:

```text
identity       → manifest identity/icon declaration and a readable project icon
context        → [[platforms]] and [[channels]]
build_profiles → [[build_profiles]] and existing command references
cleanup        → [cleanup].cache and [cleanup].build
```

Each capability has one of these deterministic statuses:

- `configured`: the declared data passed validation;
- `partial`: only part of a required declaration is present;
- `missing`: no declaration is present;
- `invalid`: the declaration or one of its references failed validation;
- `legacy`: a compatibility detector found an older convention that is not an
  Atrium declaration.

The manifest status itself is `configured`, `missing`, or `invalid`. Atrium
keeps the `schema` value for internal validation and compatibility decisions;
the product UI exposes the connection status and user-facing actions without
showing protocol versions. The protocol details continue to expose capability
results and their relevant evidence for inspection. Platform/channel details
and profile actions are gated by the relevant capabilities. Cleanup is
optional: without cleanup declarations, Atrium can still measure project size
but exposes no cleanup target.

Schema 1 is strict: unknown fields at any manifest level make the manifest
invalid instead of being ignored. This prevents a misspelled field or a field
from a newer protocol version from looking configured while silently having no
effect. A future protocol revision must introduce a new schema number before
adding fields.

## Project icon

The identity section points Atrium at the icon already used by the project:

```toml
schema = 1
profile = "tauri-react"

[identity]
icon = "src-tauri/icons/icon.png"
```

Atrium keeps the project's existing icon convention. It does not impose a
universal size, shape, asset layout, or replacement icon. The path must be
relative to the project and resolve to a readable image that Atrium can show in
the board preview. Native platform icon sets remain in their normal framework
locations, and the manifest can point to the source image the project already
uses.

The internal reader still protects Atrium from loading an unreadable or
unbounded file, but that safety limit is not an icon specification for the
project.

## Legacy projects

Projects without a manifest continue to use deterministic legacy detection so
existing workspaces remain visible. Atrium marks those icons as `legacy` and
offers integration guidance. It does not silently promote a legacy guess to a
declared project contract.

## Project profiles

`profile` is an optional deterministic adapter hint, such as `tauri-react`,
`electron-react`, `flutter`, `unity`, or `generic`. Profiles describe where
Atrium may read conventional project facts; they do not change the repository's
native project scaffolding or build ownership.

## Targets, channels, and build profiles

Platform and distribution data is never inferred from Markdown, README files,
workflow prose, or arbitrary repository text. When a project needs to appear in
the Atrium platform/channel board, it declares the relationship in the same
manifest:

```toml
[[platforms]]
id = "macos"
label = "macOS"

[[channels]]
id = "apple-app-store"
label = "App Store"

[[build_profiles]]
id = "macos-app-store"
platform = "macos"
channel = "apple-app-store"
artifacts = ["src-tauri/target/release/bundle/macos"]

[build_profiles.commands]
run = "package.json#scripts.dev"
build = "package.json#scripts.build:macos:appstore"
```

The `build_profiles` entry is the executable relationship. It combines a
target platform with a distribution channel and binds each action to a command
already owned by the repository. A command reference may use the discovered
command id or its structured source path. Atrium never replaces that command
with its own build implementation.

The command roles are framework-neutral:

- `run` points to the project's primary local runtime entry. A web development
  server is valid for a web target; desktop, CLI, game, and mobile targets use
  their existing project-owned run entry. It must not point only to a
  subordinate service required by another runtime. If no reliable entry exists,
  the field is omitted rather than guessed.
- `check` points to an existing project quality-validation command, such as
  tests, lint, type checking, or another command with a meaningful exit result.
- `build` points to the existing command that produces the profile's declared
  distributable artifacts. Installation, replacement, and opening an installed
  application are separate explicit actions; they are not implicit build
  behavior.

A framework command such as `tauri dev` is only an example for a repository that
actually uses Tauri. Atrium does not require Tauri or any other framework and
does not invent wrapper commands.

Each build profile may also declare the files or directories it produces:

```toml
[[build_profiles]]
id = "macos-app-store"
platform = "macos"
channel = "apple-app-store"
artifacts = [
  "src-tauri/target/release/bundle/macos",
  "dist/Atrium.dmg",
]
```

Artifact paths are repository-relative and are owned by the project. Atrium
reports only those exact declarations, including missing outputs, size, file
count, and latest modification time. It does not infer `dist`, `target`, or
framework-specific output directories. An artifact can be opened from the
board only when the declared path currently exists and stays inside the
repository.

## Project tools and links

The optional project-owned tool declarations let Atrium provide a terminal
launcher without guessing tools from the project structure. Editor launchers
are intentionally not part of the current protocol while Atrium defines a
project-specific multi-tool model:

```toml
[tools]
terminal = ""

[[links]]
id = "preview"
label = "Local preview"
url = "http://127.0.0.1:3000"
kind = "preview"
```

`terminal` is a single executable value, not a shell pipeline or argument
string. Atrium passes the project path as the current directory. An empty or
missing declaration uses the operating-system default terminal; Atrium does not
ask users to enter a terminal command. Links must be absolute `http://`,
`https://`, or `file://` URLs with a host/path as appropriate; embedded
credentials, malformed URLs, duplicate IDs, and unsupported schemes are invalid
manifest entries. These declarations are convenience actions and do not become
platform, channel, payment, or build facts.

Only a valid build profile can execute a target-specific action. The repository
command browser is a separate execution path: it deterministically discovers
commands from project files, keeps them hidden until the user explicitly
confirms, and then allows any discovered command to run independently of
profile binding. A command may therefore appear in both places when the
project uses the same native command for a formal profile action and for its
repository command list.

## Cleanup declarations

Cache and build cleanup is also project-owned. Atrium does not infer cleanup
directories from a framework name or delete a conventional directory merely
because it exists. The project development Agent may declare directories that
are safe to regenerate:

```toml
[cleanup]
cache = ["node_modules/.cache", ".turbo"]
build = ["dist", "src-tauri/target"]
```

Paths must be relative to the repository, must not contain `..`, and must not
declare protected roots such as `.git`, `.atrium`, `node_modules`, or `vendor`.
Cleanup declarations must also not overlap: do not declare both a directory and
one of its descendants. Path identity is compared without regard to letter
case so the same manifest remains safe on case-sensitive and case-insensitive
filesystems. Atrium marks overlapping declarations invalid so size metrics
cannot double-count and cleanup cannot process the same files twice.
Atrium only displays and removes declared directories that currently exist and
are real directories, never symlinks. Missing declarations produce no cleanup
targets; the configuration guidance tells the project development Agent how to
add them.

The board may let the user select a subset of the declared entries. The cleanup
command still intersects that selection with the manifest declaration, so a UI
selection can never expand the deletion scope.

Future optional dimensions such as region and payment provider belong on the
build profile, not on the generic platform or channel lists. They are not
required by the current schema.

The Atrium guidance action writes the agent-facing guidance bundle in one
operation:

```text
.atrium/guidance.toml
.atrium/reports/project-configuration.md
```

`guidance.toml` is machine-readable metadata containing the current
`guidance_revision` and the manifest `protocol_schema`. Atrium uses it only to
decide whether the agent-facing guidance bundle needs to be regenerated; it is
not a project fact and does not replace `manifest.toml`.

The project development Agent acknowledges that it has applied the guidance by
updating the separate, machine-readable file:

```text
.atrium/guidance-sync.toml
```

The acknowledgement contains the same `guidance_revision` and
`protocol_schema` values as `guidance.toml`. It must be written only after the
Agent has synchronized `manifest.toml` and the marked Atrium rule in
`AGENTS.md`. Atrium does not read `AGENTS.md`; it uses this acknowledgement to
keep the Agent guidance action available across rescans and restarts until the
project Agent has completed the handoff.

The configuration report contains a marked, versioned rule block for the
project development Agent to install or update in the repository's
`AGENTS.md`. The rule asks that Agent to update `manifest.toml` whenever
development changes an Atrium-relevant field such as the icon, supported
platforms/channels, command bindings, artifacts, or cleanup declarations. It
also asks the Agent to apply the migration instructions when a newer guidance
revision is present. It also includes a complete `manifest.toml` template and
the current project icon detection summary. Unrelated project instructions in
`AGENTS.md` must be preserved.

When Atrium changes the guidance contract, it increments `guidance_revision`
and regenerates the bundle. The next project guidance action supplies the
updated rule and prompt, allowing the project development Agent to migrate the
manifest, its persistent rule, and the acknowledgement. These reports and
metadata are instructions for the project development Agent; Atrium does not
parse them back into project facts.

If `.atrium/manifest.toml` is missing, Atrium reports the configuration as
undeclared. It does not promote framework names, directory names, CI files, or
Markdown mentions into platform or channel facts.
