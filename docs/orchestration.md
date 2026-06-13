# Orchestration

This document explains how the build is orchestrated.

## Meta-Orchestration Harness

The build uses a two-layer harness architecture:

### Layer 1: Domain Harness (`app/src/harness/`)

The application-level pipeline that processes chemistry diagrams:

```
ingest → route → parse → compile → verify → edit → export
```

Defined by typed contracts in `contracts.ts`. Mock nodes (`mock.ts`) implement the full pipeline so the UI runs end-to-end before real nodes land. Real nodes (serverless parse, rdkit-js compile, deterministic verify) swap in behind the same `HarnessNodes` interface.

### Layer 2: Build Harness (`.claude/workflows/buildday.js`)

The meta-orchestration layer that coordinates the build process itself:

```
baseline → classify → fan-out → verify → integrate → deploy
```

Five phases:

1. **Baseline** — verify current `main` is green (typecheck + build + vitest + selftest + gate + bare-handle grep)
2. **Classify** — route incoming work to lanes (parse / render / edit / verify / deploy / docs)
3. **Fan-out** — one agent per lane, worktree-isolated, working in parallel
4. **Adversarial verify** — independent skeptic agent per lane; default-skip, must prove correctness
5. **Integration** — merge lanes in dependency order (parse → verify → render → edit → deploy → docs), gate after each merge

### Verification Gate (exact sequence)

```bash
npm run typecheck --prefix app
npm run build --prefix app
npm run test --prefix app          # vitest — tolerates rdkit WASM ?url
npm run selftest --prefix app      # esbuild→node — rdkit must NOT be in this import path
npm run gate                       # publication gate: credentials + residue scan
grep -rn "handle-patterns" app/src/  # bare-handle check (gate only scans docs/)
```

### Lane Isolation

Each feature lane runs in a separate git worktree off `origin/main`. This prevents in-place rebases from clobbering another lane's uncommitted edits. Lanes are:

- **parse** — image → SMILES → ChemIR (serverless proxy, VLM)
- **render** — ChemIR → tactile SVG + braille + print sheet
- **edit** — natural language → EditOp (Claude-backed resolver + regex fallback)
- **verify** — canonical SMILES diff, fidelity report (rdkit-js)
- **deploy** — Vercel, CI, smoke tests
- **docs** — README, slides, brief, orchestration

### Merge Order

Dependency-driven: parse first (provides the data), then verify (gates correctness), then render (consumes verified IR), then edit (mutates rendered output), then deploy, then docs.

## Manual Pattern (fallback)

1. Long-running agents distill their taste into public-safe artifacts.
2. The project brief turns the brainstormed idea into a clean build environment.
3. A fresh Claude Code session reads this repo and performs real implementation or validation work.
4. The official session log is exported from that clean session.
5. Public artifacts are checked with `npm run gate` before commit.

## Evidence Policy

Use short, selected, public-safe excerpts only. Do not paste raw historical agent transcript dumps.

