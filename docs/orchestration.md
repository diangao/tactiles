# Orchestration

This document should explain how the build was orchestrated without exposing raw private chat history.

## Intended Pattern

1. Long-running agents distill their taste into public-safe artifacts.
2. The project brief turns the brainstormed idea into a clean build environment.
3. A fresh Claude Code session reads this repo and performs real implementation or validation work.
4. The official session log is exported from that clean session.
5. Public artifacts are checked with `npm run gate` before commit.

## Evidence Policy

Use short, selected, public-safe excerpts only. Do not paste raw historical agent transcript dumps.

