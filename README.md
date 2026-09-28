# Atrium

Atrium is a local-first visual project board for independent software studios.
It gives a coherent view of local projects without imposing a project lifecycle
or replacing the repository's own development workflow.

The current release focuses on these capabilities:

1. scan a workspace and discover project repositories;
2. read explicit platform, channel, and build-profile declarations from
   `.atrium/manifest.toml`;
3. discover and invoke existing Run / Check / Build entrypoints;
4. read Git branch, working-tree change counts, upstream sync counts, remote, and recent-commit facts;
5. surface existing repository icons and switch between English and Chinese UI;
6. expose deterministic protocol capability status, local preference persistence,
   and automatic/single-project refresh;
7. inspect project storage and clean only manifest-declared cache/build directories.
8. persist execution records and logs locally with project, profile, platform, channel, and Git context;
9. inspect only the build artifacts explicitly declared by each build profile.
10. search, filter, sort, favorite, and hide projects;
11. scan multiple workspaces with deterministic exclusions and open project tools/links;
12. preview and clean selected manifest-declared directories;
13. compare Git revisions and copy a structured commit/file change summary.

Website synchronization, payment channels, release orchestration, universal
project stages, and development-agent management are intentionally outside the
current release. Project scaffolding and template copying are also outside the
board's responsibility: a project's normal development tool creates it, while
Atrium's protocol guidance connects it to the board afterward. SQLite migration,
artifact history, update-log generation, and Windows/Linux host verification
remain follow-up work.

## Technology

Atrium uses Tauri 2 + React/TypeScript + Rust. The UI stays focused on
visualization and interaction; filesystem scanning, Git inspection, command
discovery, and process execution live behind the Rust/Tauri boundary.

The alternatives considered before implementation are recorded in
[docs/TECHNOLOGY_OPTIONS.md](docs/TECHNOLOGY_OPTIONS.md). That document is a
decision record, not an instruction to change the selected stack.

Display preferences use local storage. The first execution-history slice uses
the application data directory with a bounded JSON history; SQLite remains the
planned persistence boundary for scan cache, multi-workspace data, and larger
history migrations, independent of the final desktop shell.

## Development

```sh
npm install
npm run dev
```

For a browser-only UI preview:

```sh
npm run dev:web
```

The browser preview renders deterministic demo data; it does not scan real
repositories.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the architecture,
[docs/INTERACTION_STANDARDS.md](docs/INTERACTION_STANDARDS.md) for interaction
standards, and [AGENTS.md](AGENTS.md) for implementation guardrails.

The project-side integration contract is documented in
[docs/ATRIUM_PROTOCOL.md](docs/ATRIUM_PROTOCOL.md). Atrium manifests are
stored in `.atrium/manifest.toml`; generated conformance reports are kept in
`.atrium/reports/`.

`scripts/generate-icon.swift` regenerates `src-tauri/icons/icon.png` on macOS.
