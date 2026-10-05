# Atrium

English | [简体中文](README.zh-CN.md)

[![Quality](https://github.com/iron90/Atrium/actions/workflows/quality.yml/badge.svg)](https://github.com/iron90/Atrium/actions/workflows/quality.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

![The Atrium board with a project selected in the detail card](docs/assets/board-overview.png)

Atrium is a visual project board for the projects on your machine, built for
independent software studios. It scans your workspace, reads each project's own
`.atrium/manifest.toml` declarations, and arranges the facts — Git state,
platform and channel context, storage, build profiles, run history — into one
view, without imposing a project lifecycle or replacing the repository's own
development workflow. The app is Tauri 2: a React/TypeScript UI on a Rust
native core, and the interface ships in English and Chinese.

## The board

The Projects page lists every repository discovered in your workspaces.

- Search, filter by platform or channel, and sort by name, Git state, recency, or storage size.
- Favorite and hide projects; hiding only affects the board, never the files.
- Open a project's folder, terminal, remote, and declared links from its row.
- Facts refresh automatically; the selected project can also be refreshed on demand.

## The project detail card

Selecting a project opens the detail card, top to bottom:

1. **Repository** — local path, remote, checked-out branch, upstream sync counts, and working-tree state. A read-only branch picker views another branch's history without checking it out; Atrium never modifies refs.
2. **Atrium protocol** — capability status read from `.atrium/manifest.toml`, plus one-click generation of guidance files and a copyable prompt for the project's development agent.
3. **Declared context** — the platforms and channels the project declares.
4. **Storage** — project size and cleanable entries, with per-entry selection; cleanup only ever touches directories the manifest declares.
5. **Build profiles** — the project's own Run / Check / Build bindings, with inspection of the build artifacts each profile explicitly declares.
6. **Discovered repository commands** — commands found in the repository itself, shown only after explicit confirmation.
7. **Runs** — start a bound action and watch its live output; finished runs are recorded locally with project, profile, platform, channel, and Git context, and the persistent run history keeps logs openable and copyable.
8. **Recent commits** — the loaded history, plus ahead/behind counts for the viewed branch.

Which of these sections appear at all is up to you — each one has a switch on
the Settings page.

## The Git history page

Pick a project, enter a commit, branch, or tag range, and read the commit and
file-change summary between the two revisions; the summary copies out as
structured JSON.

## Settings

- Workspaces: add, edit, and remove the folders Atrium scans, with deterministic exclusion names; scanning lives here and nowhere else.
- Appearance: three themes, two layouts, and the English/Chinese interface switch.
- Project detail card: one switch per detail-card section.

## What it deliberately does not do

Website synchronization, payment channels, release orchestration, universal
project stages, and development-agent management are intentionally outside the
current release. Project scaffolding and template copying are also outside the
board's responsibility: a project's normal development tool creates it, while
Atrium's protocol guidance connects it to the board afterward. SQLite migration,
artifact history, update-log generation, and Windows/Linux host verification
remain follow-up work.

## Download

Installers for macOS (`.app` / `.dmg`) and Windows (`.msi` / `.exe`) are built
automatically for every pushed `v*` tag and attached to the matching
[GitHub Release](https://github.com/iron90/Atrium/releases). The artifacts are
unsigned: on macOS, right-click the app and choose Open on first launch; on
Windows, SmartScreen shows a one-time warning.

## Development

Requirements: Node.js 24 (see `.nvmrc`) and Rust 1.97.1 (pinned in
`rust-toolchain.toml`).

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

`npm run quality` runs formatting, typecheck, lint, unit tests, the frontend
build, and the Rust format/test/clippy gates — the same set the CI workflow
enforces on every push.

`scripts/generate-icon.swift` regenerates `src-tauri/icons/icon.png` on macOS.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — architecture and persistence boundaries.
- [docs/ATRIUM_PROTOCOL.md](docs/ATRIUM_PROTOCOL.md) — the integration contract a project adopts so the board can read it.
- [docs/INTERACTION_STANDARDS.md](docs/INTERACTION_STANDARDS.md) — interaction standards.
- [docs/TECHNOLOGY_OPTIONS.md](docs/TECHNOLOGY_OPTIONS.md) — the technology decision record. It documents the alternatives considered before implementation; it is not an instruction to change the selected stack.
- [AGENTS.md](AGENTS.md) — implementation guardrails for coding agents.

## License

[MIT](LICENSE)
