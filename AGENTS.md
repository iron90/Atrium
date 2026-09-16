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
