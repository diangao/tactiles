# Claude Code Build Environment

You are working inside a public Build Day repository.

## Allowed Inputs

Read only:

- files in this repository;
- public source URLs pasted into `docs/brief.md`;
- explicit instructions from the current clean build session.

Do not read or import:

- old local memory files;
- private notes;
- private agent channels or transcripts;
- host-wide credentials;
- unrelated project directories.

## Build Rules

1. Keep all project assumptions in `docs/brief.md`.
2. Keep taste and review criteria in `docs/taste-rubric.md`.
3. Keep orchestration explanation in `docs/orchestration.md`.
4. Do not paste secrets, private emails, personal data, or raw historical chat logs.
5. Before committing, run:

```bash
npm run gate
```

## Session Log

The official submission log should come from a fresh Claude Code session using `/export`.

Do not use raw long-running agent transcripts as the official session log.

