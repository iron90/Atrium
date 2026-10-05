# Contributing to Atrium

Thanks for looking under the hood. Atrium is a local-first visual project
board, and contributions are welcome within the boundaries described below.

## Development setup

Requirements: Node.js 24 (see `.nvmrc`) and Rust 1.97.1 (pinned in
`rust-toolchain.toml`).

```sh
npm install
npm run dev      # native Tauri app
npm run dev:web  # browser preview with deterministic demo data
```

## Quality gates

```sh
npm run quality
```

This runs formatting, typecheck, lint, unit tests, the frontend build, and the
Rust format/test/clippy gates — the same set CI enforces on every push. Please
make sure it passes before opening a pull request.

## Ground rules

- Read [AGENTS.md](AGENTS.md) first: it defines the product boundary Atrium
  commits to. In particular, Atrium observes and aggregates facts; it does not
  define project lifecycles, replace repository tooling, or mutate Git state.
- Git and structured repository files are the source of truth for repository
  facts. Never turn an inference into a configured fact, and keep evidence
  paths attached to structured values.
- The integration contract lives in
  [docs/ATRIUM_PROTOCOL.md](docs/ATRIUM_PROTOCOL.md); changes to the protocol
  must keep that document and the schema in sync.
- All repository documentation and commit messages are in English.

## Commit messages

Use conventional commits with a lowercase imperative subject:

```text
feat: add a workspace exclusion preview
fix: bound captured run output
```

Types in use: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `ci`.

## Reporting issues

Open a GitHub issue with the platform, the steps to reproduce, and the facts
Atrium showed versus the facts the repository actually had. For security
matters, follow [SECURITY.md](SECURITY.md) instead of opening an issue.
