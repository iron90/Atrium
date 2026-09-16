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

Atrium evaluates the manifest and the icon contract into four independent
capabilities. The result is stored in the scan snapshot and is never inferred
from guidance Markdown:

```text
identity       → manifest identity/icon declaration and icon.v1 conformance
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

The manifest status itself is `configured`, `missing`, or `invalid`, and its
`schema` value is shown alongside the capability results. Platform/channel
details and profile actions are gated by the relevant capabilities. Cleanup is
optional: without cleanup declarations, Atrium can still measure project size
but exposes no cleanup target.

## `icon.v1`

The first protocol field is the project-board preview icon:

```toml
schema = 1
profile = "tauri-react"

[identity]
icon = "src-tauri/icons/icon.png"
```

Rules:

- `schema` must be `1`.
- `identity.icon` must be a relative path inside the project.
- The file must be tracked source material, not a generated `build/`, `dist/`,
  or `target/` artifact.
- Canonical formats are PNG, SVG, and WebP.
- The file must be non-empty and no larger than 512 KiB.
- Native platform icon sets remain in their normal framework locations. The
  manifest may point to one of those source files, or to a small dedicated
  preview icon.

## Legacy projects

Projects without a manifest continue to use deterministic legacy detection so
existing workspaces remain visible. Atrium marks those icons as `legacy` and
offers a conformance report. It does not silently promote a legacy guess to a
declared project contract.

## Conformance reports

When requested from the project inspector, Atrium writes:

```text
.atrium/reports/icon-conformance.md
```

The report contains the fixed rule version, detected evidence, rejection
reasons, and an actionable instruction for the project development Agent.
Atrium does not modify the project's icon files or build configuration.

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
ask users to enter a terminal command. Links accept only `http://`, `https://`, and
`file://`; duplicate IDs and unsupported schemes are invalid manifest entries.
These declarations are convenience actions and do not become platform,
channel, payment, or build facts.

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

The Atrium guidance action writes both agent-facing reports in one operation:
`.atrium/reports/project-configuration.md` for the manifest and
`.atrium/reports/icon-conformance.md` for the icon contract. These reports are
instructions for the project development Agent; Atrium does not parse them
back into project facts.

If `.atrium/manifest.toml` is missing, Atrium reports the configuration as
undeclared. It does not promote framework names, directory names, CI files, or
Markdown mentions into platform or channel facts.
