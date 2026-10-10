# Atrium Agent Instructions

## Product boundary

Atrium is a local-first visual project board. It observes and aggregates facts
from local repositories and invokes commands already owned by those repositories.

Atrium must not:

- define or store a universal project lifecycle or `Stage` field;
- replace a repository's build, run, test, or release configuration;
- manage development agents or display agent transcripts;
- become a deployment, payment, publishing, or website synchronization service in v1;
- mutate a project's Git history;
- check out branches or modify any Git refs — branch inspection is read-only
  (`log` / `diff` / `rev-list`), and the worktree belongs to the project
  development Agent.

## Source of truth

- Git and structured repository files are authoritative for repository facts and
  commands. Platform/channel/build-profile facts come from the explicit
  `.atrium/manifest.toml` contract; Markdown and arbitrary text are never
  evidence for those fields.
- Atrium owns only its workspace roots, scan cache, user display preferences,
  explicit local overrides, and run records.
- Structured facts must keep their evidence path. Do not turn an inference into
  a configured fact.

## Architecture rules

- Keep the Rust native core responsible for filesystem access, Git, process
  execution, and OS-specific behavior.
- Keep React responsible for presentation, interaction, themes, and layouts.
- Expose typed, narrow Tauri commands. Do not expose a general-purpose shell
  command from the frontend.
- Represent executable commands as `program + args + working directory`; do not
  concatenate untrusted strings into a shell command.
- Every new platform-specific behavior must have a non-platform fallback or an
  explicit capability error.
- All user-facing project facts should be traceable to a scan or a persisted
  local configuration.

## Verification

Before handing off a change, run the smallest relevant checks and prefer the
full checks when the bridge contract or native code changes:

```sh
npm run typecheck
npm test -- --run
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo test --manifest-path src-tauri/Cargo.toml
```

## Releasing

When the user asks to tag or publish a release:

- Read the commits since the previous `vX.Y.Z` tag. Summarize only changes a
  person using Atrium would notice. Leave out formatting, CI, refactors, and
  other internal commits. Do not copy commit subjects into the summary.
- Write that summary twice: once in English, once in Chinese. Prose is enough.
  Do not add Added, Fixed, or Removed headings unless the user asks.
- Show both summaries to the user before creating the tag.
- Create an annotated tag with
  `node scripts/tag-release.mjs vX.Y.Z --en-file notes.en.txt --zh-file notes.zh.txt`.
  The script inserts the `atrium:notes:en` and `atrium:notes:zh` markers.
  Do not create a lightweight tag, and do not write the macOS `xattr` command
  into the summary. The release script appends that command outside the markers.
- Do not push the tag unless the user asks. The release workflow rejects a tag
  whose message is missing either language section.

<!-- BEGIN ATRIUM MANAGED RULES -->

Atrium guidance revision: 4

## Check / Build / Run command bindings

Each build profile must reference commands already owned by the project:

- `check`: an existing project quality-validation entry such as tests, lint, typecheck, or another command that reports success or failure through its exit code.
- `build`: an existing project build entry that produces the profile's declared distributable artifacts. Build must not silently install, replace, or open an application; installation is a separate, explicit user action.
- `run`: a command that starts or provides the primary target. First identify the profile's primary local runtime entry and its existing local entry point. A web development server is valid for a web target; a desktop target should use its own desktop launcher; CLI, game, and mobile targets should use their existing local run entry. Do not bind only a subordinate service, such as a frontend server required by a desktop shell. If no reliable entry exists, omit `run` instead of guessing.

These rules are framework-neutral. A framework command such as `tauri dev` is only an example when the repository actually uses Tauri. Atrium does not invent or wrap project commands.

## Host requirements and verification

`platform` is the target of the produced artifact. Keep the artifact target, compatible execution hosts, and verification evidence separate; do not infer either host requirement or verification from the target platform. `[build_profiles.host_requirements]` declares the hosts where an action may execute; it is the lower compatibility boundary, not proof that the action has passed. `[build_profiles.verification]` records hosts where the exact bound action has passed; it is the upper evidence boundary. Declare host requirements and verification independently for `check`, `build`, and `run` using only `macos`, `windows`, or `linux`, and update them whenever cross-compilation or toolchain support changes.

For every profile action and candidate host, inspect the actual program, args, working directory, expanded scripts, SDKs, and toolchain. If the current host is not listed in `host_requirements`, do not run the action, do not call it a failure, and do not remove its command binding; record the mismatch as deferred verification. When the current host matches, run the exact project command and use these postconditions as proof:

| Action  | Required proof                                                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check` | The complete command finishes with exit code `0`.                                                                                                                                                                               |
| `build` | The complete command finishes with exit code `0` and produces every required declared artifact during that run; each artifact must exist, be non-empty, and have the expected path/type. Pre-existing stale files do not count. |
| `run`   | The primary target starts and passes an available readiness or smoke check; process spawn alone is not enough.                                                                                                                  |

Add a host to `verification` only after complete verification succeeds. Do not add a host after a failure or missing dependency. Do not delete `host_requirements` or the command solely because the current environment is unavailable. Do not remove a compatible host merely because it cannot be tested on the current machine. Do not treat the target platform, target triple, runner name, an installed executable, CI configuration, an intermediate log, or a successful sub-step as proof. Cross-compilation is supported only when the complete toolchain is present on that host and the exact command produces and verifies the target artifact; the presence of `cargo-xwin`, `cross`, or a target triple is not evidence. Remove a command only when no real project-owned entry exists. Omit an action's host field only when the command has actually been established to be host-independent; omission must not mean “not checked”.

Every bound action on a candidate host has one of three verification states: verified (the host is recorded in `[build_profiles.verification]`), blocked (a `[[build_profiles.<profile-id>.verification_blockers]]` entry declares why verification cannot complete on that host), or pending (no record yet). When the current host matches but verification cannot complete — a missing signing identity, credential, SDK, or toolchain — declare the blocker with the exact reason instead of leaving the action silently pending.

Verification evidence follows the command: when several profiles bind the same command for the same action, execute it once per host and record the verified host under each identical binding; never re-run an identical command on a host where it has already passed solely because another profile binds it too. A declared blocker follows the same rule: it is attested once per command and host, and identical bindings inherit it.

Supported host values are `macos`, `windows`, and `linux`. The three actions may use different lists. Atrium disables and rejects a profile action whose declared host list does not include the current host, before starting the process. It also disables an action on a matching host until that host appears in `verification`, and it shows the declared blocker reason while the action stays disabled.

## Run target rules

Audit every existing profile's run binding, even when its host requirement or verification record already passes. Run must start the target represented by that profile's platform and channel. A generic development command that starts a macOS application does not verify a Windows profile's Run. Likewise, a direct-channel application does not verify a store-channel runtime unless the project proves that the runtime behavior is equivalent. Development entries are valid only when the actual runtime matches the profile target.

Verify the running application's platform, channel configuration, and readiness, and record this evidence in the verification matrix and `[build_profiles.verification]`. `host_requirements` declares where the target may run; `verification` records where it actually passed. Only list a host in verification after running on that host. Atrium requires matching host and target systems for Run on macos, windows, and linux desktop profiles. Cross-system desktop Run is not supported, including through compatibility layers or remote launchers. Other targets use their declared host requirements. Being able to build Windows artifacts on macOS does not prove that Windows Run works there. Check and Build retain independent host requirements.

If no matching project-owned run entry exists, omit Run and explain why. If an entry exists but its target host does not match the current host, preserve the binding and record the verification as deferred. If the target host matches but the command or environment cannot be verified, declare the blocker in the manifest with the exact reason and report it. Do not replace a target-specific entry with a generic local dev command just to pass verification.

## Validation blockers and completion

Before testing, inspect whether a command depends on fixed ports, background services, credentials, SDKs, or other environment state. Atrium or another external process must not be terminated or reconfigured. If a port is occupied, do not treat the collision itself as proof that the project command fails. Use an alternate port only when the project already supports it through an environment variable, command-line option, or test configuration, and record the actual port in the verification matrix. Do not temporarily edit or commit project configuration just to avoid a collision. A host mismatch is deferred verification and is not an environment blocker; a matching-host failure or unavailable dependency is a blocker.

Declare every blocker instead of leaving it silent: add a `[[build_profiles.<profile-id>.verification_blockers]]` entry with the bound `action`, the affected `host` (which must be declared in that action's `host_requirements`), and a `reason` naming the exact missing dependency — a signing identity, credential, SDK, or toolchain. A declared blocker keeps the command binding and its host requirement intact; Atrium shows the reason until the environment is fixed and verification passes. Never write an unverified host into `verification` to close a blocker, never disguise a blocker as unsupported, and never delete the command binding just to complete synchronization.

Choose the project's real quality gate before running `check`. Do not replace a failed full check with a narrower passing command merely to obtain exit code `0`; a narrower command is valid only when the project already defines it as the explicit scope for that profile, and that scope is reported. Port, dependency, credential, and toolchain failures are blockers to declare.

## Cleanup declarations

Cleanup declarations are project-owned, and they are expected to be complete. Declare every project-relative directory that grows across builds or tool runs and can be fully regenerated afterwards by the project's own commands: build output directories, package-manager and tool caches, and generated bundles. The everyday incremental build output is usually the largest consumer, so declare the build toolchain's whole default output directory including profile or target subdirectories — for example a Rust `target` directory with its `debug`, `release`, and target-triple children — not only the directories referenced by build profiles. Verify before declaring that the project's own commands regenerate the content and that no manual, credential, or user state lives inside. Dependency or vendor subdirectories are valid once that project-specific verification has been made; a nested dependency cache such as `node_modules/.vite` may be declared after it. Do not leave a regenerable directory undeclared just because no build profile references it.

Atrium only enforces that cleanup paths are relative, stay inside the project at execution time, do not traverse symbolic links outside it, and do not target `.git` or `.atrium`; it does not maintain a universal denylist of project directories. Duplicate or nested declarations are rejected only so storage metrics and cleanup targets remain deterministic.

## Guidance sync acknowledgement

`.atrium/guidance-sync.toml` acknowledges that the project's declarations are synchronized with this guidance revision. It is a declaration-completeness acknowledgement, not a partial-progress marker and not a claim that every host was tested on the current machine: verification evidence lives in the manifest, and an environment problem is recorded as a declared verification blocker, never as a reason to skip the acknowledgement. Before writing it, account for every action bound in the manifest on the current host — each one is either verified in `[build_profiles.verification]` or carries a declared blocker in `[[build_profiles.verification_blockers]]` with the observed reason. Other declared hosts need no accounting; they wait for their own host. After applying the manifest changes and updating this managed block, update `.atrium/guidance-sync.toml` with the current `guidance_revision` and `protocol_schema` values from `.atrium/guidance.toml`. Never confirm synchronization by deleting commands, narrowing the check scope, or inventing host support; declare the real blocker instead. Only write this acknowledgement after the declarations are complete.

## Keeping the protocol current

When a development task changes the project's icon, supported platforms or channels, Check / Build / Run commands, build artifacts, cleanup directories, or another Atrium protocol field, re-read the current `.atrium/guidance.toml`, `.atrium/manifest.toml`, and relevant project files, and update `.atrium/manifest.toml` so it matches the project's actual current structure. If `.atrium/guidance.toml` contains a newer guidance revision than this managed block, read the latest Atrium guidance reports, apply their migration instructions, and update this managed block to the latest version. Do not invent platforms, channels, commands, artifacts, cleanup paths, or host support. Do not launch, control, or terminate Atrium.

<!-- END ATRIUM MANAGED RULES -->
