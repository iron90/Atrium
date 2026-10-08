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
effect. Schema 1 supports every section documented here, including
`host_requirements` and `verification` records: `host_requirements` declares
where an action may run, while `verification` records hosts where the exact
command has passed. A host mismatch is deferred verification, not a failure,
and must not cause a valid command binding to be removed. A future protocol
revision must introduce a new schema number before adding fields.

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
build = "package.json#scripts.build:macos:appstore"
run = "package.json#scripts.dev"

[build_profiles.host_requirements]
build = ["macos"]
run = ["macos"]

[build_profiles.verification]
build = ["macos"]
run = ["macos"]
```

The `build_profiles` entry is the executable relationship. It combines a
target platform with a distribution channel and binds each action to a command
already owned by the repository. A command reference may use the discovered
command id or its structured source path. Atrium never replaces that command
with its own build implementation.

The command roles are framework-neutral, in workflow order:

- `check` points to an existing project quality-validation command, such as
  tests, lint, type checking, or another command with a meaningful exit result.
- `build` points to the existing command that produces the profile's declared
  distributable artifacts. Installation, replacement, and opening an installed
  application are separate explicit actions; they are not implicit build
  behavior.
- `run` must execute the actual platform and channel target of its profile.
  A generic dev command starting a macOS app is not evidence that Windows Run
  works. Cross-building Windows artifacts on macOS does not establish Run
  support. Record the running target platform, channel configuration, and
  readiness before declaring Run hosts. Atrium requires matching host and target
  systems for Run on `macos`, `windows`, and `linux` desktop profiles, in addition
  to the declared host allowlist. Cross-system desktop Run is not supported,
  including through compatibility layers or remote launchers. Other target IDs
  retain their declared host requirements. This restriction is applied both to
  button availability and native execution validation (revision 9).
  Check and Build have independent host requirements. Revision 7 requires
  re-auditing existing Run bindings, including previously accepted host lists.
  A target host mismatch is deferred verification and must not be treated as a
  failure; a matching-host command or environment failure remains a blocker
  and must not be acknowledged in guidance-sync.
- `run` points to the project's primary local runtime entry. A web development
  server is valid for a web target; desktop, CLI, game, and mobile targets use
  their existing project-owned run entry. It must not point only to a
  subordinate service required by another runtime. If no reliable entry exists,
  the field is omitted rather than guessed.

The target platform and the operating system that executes a command are
separate facts. A profile declares compatible execution hosts and records
successful verification hosts independently:

```toml
[build_profiles.host_requirements]
check = ["macos", "windows", "linux"]
build = ["windows"]
run = ["macos", "windows"]

[build_profiles.verification]
check = ["macos", "windows"]
build = ["windows"]
run = ["macos"]
```

Host values are limited to `macos`, `windows`, and `linux`. The three actions
may use different lists. `host_requirements` is the lower compatibility
boundary; `verification` is the upper evidence boundary. Omit an action's
host requirement only when it is genuinely unrestricted; do not infer host
support from the target `platform`. A host mismatch is deferred verification,
not a failure, and must not cause a valid command binding to be removed. Atrium
disables the corresponding profile action in the UI and rejects it before
process execution when the current host is not listed. It also keeps an action
disabled on a matching host until that host appears in `verification`.

Verification evidence follows the command, not the profile: when two profiles
bind the same command for the same action, a host recorded in one profile's
`verification` counts as verified for the identical binding everywhere, and
pending-verification prompts do not ask the Agent to re-run an identical
command on a host where it has already passed.

`verification` records are declarations made by the project Agent, not
measurements taken by Atrium. Atrium reads them as structured manifest state and
gates profile actions on them; it does not certify, re-run, or audit the
underlying verification. A "verified" status in the UI therefore means "the
project Agent claims this action passed on this host", and the project Agent
owns the responsibility for its accuracy.

Before adding a host to `verification`, the project Agent must inspect the exact
program, arguments, working directory, expanded scripts, SDKs, and toolchain,
then run the exact command bound in the manifest on that host. The evidence is
action-specific:

- `run` must start the primary target and pass an available readiness or smoke
  check; seeing a process spawn is not enough;
- `check` must finish with exit code `0`;
- `build` must finish with exit code `0` and create every required declared
  artifact during that run; each artifact must exist, be non-empty, and have
  the expected path and type. A stale artifact or an intermediate successful
  sub-step is not evidence.

The target platform, target triple, runner name, installed executable, CI
configuration, or a command that merely reaches its first step does not prove
host support. A cross-build host is supported only after its complete toolchain
and the actual target artifact have been verified. If verification fails, a
dependency is missing, or a host has not been tested, the Agent must not add
that host to `verification`, but it must preserve a valid compatible host in
`host_requirements`. A command should be omitted only when no real
project-owned entry exists. Omitting a host field is allowed only when the
command has been established to be host-independent; omission must not mean
that the action was not checked.

Before validation, the Agent must inspect fixed ports, background services,
credentials, SDKs, and other environment dependencies. It must not terminate or
reconfigure Atrium or another external process. A port collision is an
environment blocker, not proof that the project command is invalid. An
alternate port may be used only through a project-supported environment
variable, command-line option, or test configuration, and the actual port must
be recorded in the verification report. The Agent must not temporarily edit or
commit project configuration just to avoid the collision. If safe isolation is
unavailable, the action remains unverified.

The Agent must choose the project's real quality gate before running `check`.
After a full check fails, it must not silently replace it with a narrower
passing command just to obtain exit code `0`; a narrower command is valid only
when the project already defines it as the explicit scope for that profile.
Port, dependency, credential, and toolchain failures remain blockers.

`guidance-sync.toml` is a completion acknowledgement, not a partial-progress
marker. It may be created or updated only after every remaining profile/action
is verified successfully or repository facts explicitly prove it is out of
scope, with no unresolved environment blocker. If a blocker remains, an
existing acknowledgement stays unchanged (or no acknowledgement is created),
and the Agent reports the integration as incomplete. It must not confirm
synchronization by deleting commands, narrowing the check scope, or inventing
host support.

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
because it exists. The project development Agent decides which project
directories are safe to regenerate and may declare dependency or vendor
subdirectories when that is the correct project-specific choice:

```toml
[cleanup]
cache = ["node_modules/.cache", ".turbo"]
build = ["dist", "src-tauri/target"]
```

Paths must be relative to the repository and must not contain `..`. At
execution time, Atrium resolves each declared path and refuses anything that
leaves the project or traverses a symbolic link outside it. `.git` and
`.atrium` remain explicit protected roots because Atrium must not mutate Git
history or its own project protocol data; dependency and vendor directories
are not universal protected roots. The configuration guidance tells the
project development Agent about these boundaries and leaves the project-specific
cleanup decision to that Agent. Duplicate or nested declarations remain invalid
only so storage metrics and cleanup targets stay deterministic; they are not a
universal directory denylist.
Atrium only displays and removes declared directories that currently exist and
are real directories, never symlinks. Missing declarations produce no cleanup
targets.

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
`AGENTS.md`, completed verification for actions applicable to the current host,
and explicitly deferred or recorded other hosts. Atrium does not read `AGENTS.md`; it uses this
acknowledgement to keep the Agent guidance action available across rescans and
restarts until the project Agent has completed the handoff. A stale or missing
acknowledgement is the correct state for an incomplete integration.

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
