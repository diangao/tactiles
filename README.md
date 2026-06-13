# Build Day Harness

Public-safe scaffold for a Claude Code Build Day project.

This repo is intentionally topic-neutral. It provides the environment for:

- brainstorming the actual project direction;
- distilling long-running agent taste into public-safe artifacts;
- running a clean implementation session;
- exporting a readable Claude Code session log; and
- auditing all public submission materials before publishing.

## Artifact Contract

- `CLAUDE.md` defines the clean execution environment.
- `docs/brief.md` is filled after the project idea is chosen.
- `docs/taste-rubric.md` collects reusable product, craft, source, and verification taste.
- `docs/orchestration.md` explains how the harness shaped the build.
- `docs/session-log.md` is produced by a fresh Claude Code `/export`, not by copying raw chat.
- `docs/harness-transcript-redacted.md` may include selected public-safe excerpts only.
- `scripts/gate-public-artifacts.mjs` fails closed when public files contain likely secrets or private-context residue.

## Setup

```bash
npm run gate
```

Run the gate before every commit that touches public submission materials.

