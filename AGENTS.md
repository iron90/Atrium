# Atrium Agent Instructions

## Product boundary

Atrium is a local-first visual project board. It observes and aggregates facts
from local repositories and invokes commands already owned by those repositories.

Atrium must not:

- define or store a universal project lifecycle or `Stage` field;
- replace a repository's build, run, test, or release configuration;
- manage development agents or display agent transcripts;
- become a deployment, payment, publishing, or website synchronization service in v1;
- mutate a project's Git history.

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

<!-- BEGIN ATRIUM MANAGED RULES -->

Atrium guidance revision: 1

## Run / Check / Build command bindings

Each build profile must reference commands already owned by the project. First identify the profile's primary local runtime entry and its existing local entry point:

- `run`: a command that starts or provides the primary target. A web development server is valid for a web target; a desktop target should use its own desktop launcher; CLI, game, and mobile targets should use their existing local run entry. Do not bind only a subordinate service, such as a frontend server required by a desktop shell. If no reliable entry exists, omit `run` instead of guessing.
- `check`: an existing project quality-validation entry such as tests, lint, typecheck, or another command that reports success or failure through its exit code.
- `build`: an existing project build entry that produces the profile's declared distributable artifacts. Build must not silently install, replace, or open an application; installation is a separate, explicit user action.

These rules are framework-neutral. A framework command such as `tauri dev` is only an example when the repository actually uses Tauri. Atrium does not invent or wrap project commands.

## Host requirements and verification

`platform` is the target of the produced artifact. Keep the artifact target, compatible execution hosts, and verification evidence separate; do not infer either host requirement or verification from the target platform. `[build_profiles.host_requirements]` declares the hosts where an action may execute; it is the lower compatibility boundary, not proof that the action has passed. `[build_profiles.verification]` records hosts where the exact bound action has passed; it is the upper evidence boundary. Declare host requirements and verification independently for `run`, `check`, and `build` using only `macos`, `windows`, or `linux`, and update them whenever cross-compilation or toolchain support changes.

For every profile action and candidate host, inspect the actual program, args, working directory, expanded scripts, SDKs, and toolchain. If the current host is not listed in `host_requirements`, do not run the action, do not call it a failure, and do not remove its command binding; record the mismatch as deferred verification. When the current host matches, run the exact project command and use these postconditions as proof:

| Action  | Required proof                                                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run`   | The primary target starts and passes an available readiness or smoke check; process spawn alone is not enough.                                                                                                                  |
| `check` | The complete command finishes with exit code `0`.                                                                                                                                                                               |
| `build` | The complete command finishes with exit code `0` and produces every required declared artifact during that run; each artifact must exist, be non-empty, and have the expected path/type. Pre-existing stale files do not count. |

Add a host to `verification` only after complete verification succeeds. Do not add a host after a failure or missing dependency. Do not delete `host_requirements` or the command solely because the current environment is unavailable. Do not remove a compatible host merely because it cannot be tested on the current machine. Do not treat the target platform, target triple, runner name, an installed executable, CI configuration, an intermediate log, or a successful sub-step as proof. Cross-compilation is supported only when the complete toolchain is present on that host and the exact command produces and verifies the target artifact; the presence of `cargo-xwin`, `cross`, or a target triple is not evidence. Remove a command only when no real project-owned entry exists. Omit an action's host field only when the command has actually been established to be host-independent; omission must not mean “not checked”.

Supported host values are `macos`, `windows`, and `linux`. The three actions may use different lists. Atrium disables and rejects a profile action whose declared host list does not include the current host, before starting the process. It also disables an action on a matching host until that host appears in `verification`.

## Run target rules

Audit every existing profile's run binding, even when its host requirement or verification record already passes. Run must start the target represented by that profile's platform and channel. A generic development command that starts a macOS application does not verify a Windows profile's Run. Likewise, a direct-channel application does not verify a store-channel runtime unless the project proves that the runtime behavior is equivalent. Development entries are valid only when the actual runtime matches the profile target.

Verify the running application's platform, channel configuration, and readiness, and record this evidence in the verification matrix and `[build_profiles.verification]`. `host_requirements` declares where the target may run; `verification` records where it actually passed. Only list a host in verification after running on that host. Atrium requires matching host and target systems for Run on macos, windows, and linux desktop profiles. Cross-system desktop Run is not supported, including through compatibility layers or remote launchers. Other targets use their declared host requirements. Being able to build Windows artifacts on macOS does not prove that Windows Run works there. Check and Build retain independent host requirements.

If no matching project-owned run entry exists, omit Run and explain why. If an entry exists but its target host does not match the current host, preserve the binding and record the verification as deferred. If the target host matches but the command or environment cannot be verified, report the blocker and do not acknowledge synchronization. Do not replace a target-specific entry with a generic local dev command just to pass verification.

## Validation blockers and completion

Before testing, inspect whether a command depends on fixed ports, background services, credentials, SDKs, or other environment state. Atrium or another external process must not be terminated or reconfigured. If a port is occupied, do not treat the collision itself as proof that the project command fails. Use an alternate port only when the project already supports it through an environment variable, command-line option, or test configuration, and record the actual port in the verification matrix. Do not temporarily edit or commit project configuration just to avoid a collision. A host mismatch is deferred verification and is not an environment blocker; a matching-host failure or unavailable dependency is a blocker. Do not disguise a blocker as unsupported or delete the command binding just to complete synchronization.

Choose the project's real quality gate before running `check`. Do not replace a failed full check with a narrower passing command merely to obtain exit code `0`; a narrower command is valid only when the project already defines it as the explicit scope for that profile, and that scope is reported. Port, dependency, credential, and toolchain failures remain blockers.

## Cleanup declarations

Cleanup declarations are project-owned. Declare the exact cache and build directories that the project Agent has verified are safe to regenerate, including dependency or vendor subdirectories when appropriate; a nested dependency cache such as `node_modules/.vite` may be declared after that project-specific verification. Atrium only enforces that cleanup paths are relative, stay inside the project at execution time, do not traverse symbolic links outside it, and do not target `.git` or `.atrium`; it does not maintain a universal denylist of project directories. Duplicate or nested declarations are rejected only so storage metrics and cleanup targets remain deterministic.

## Guidance sync acknowledgement

`.atrium/guidance-sync.toml` acknowledges synchronized guidance. It is a completion acknowledgement, not a partial-progress marker and not a claim that every host was tested on the current machine. Update it when every action applicable to the current host is verified successfully and nonmatching hosts are explicitly deferred or already recorded in `verification`. If a matching-host blocker remains, leave an existing acknowledgement untouched (or do not create one), report the integration as incomplete, and never confirm synchronization by deleting commands, narrowing the check scope, or inventing host support. After applying the manifest changes and updating this managed block, update `.atrium/guidance-sync.toml` with the current `guidance_revision` and `protocol_schema` values from `.atrium/guidance.toml`. Only write this acknowledgement after the synchronization is complete.

## Keeping the protocol current

When a development task changes the project's icon, supported platforms or channels, Run / Check / Build commands, build artifacts, cleanup directories, or another Atrium protocol field, re-read the current `.atrium/guidance.toml`, `.atrium/manifest.toml`, and relevant project files, and update `.atrium/manifest.toml` so it matches the project's actual current structure. If `.atrium/guidance.toml` contains a newer guidance revision than this managed block, read the latest Atrium guidance reports, apply their migration instructions, and update this managed block to the latest version. Do not invent platforms, channels, commands, artifacts, cleanup paths, or host support. Do not launch, control, or terminate Atrium.

<!-- END ATRIUM MANAGED RULES -->
