# Publication Gate

Run `npm run gate` before committing public submission materials.

## Must Pass

- No credential-shaped strings.
- No private emails.
- No private channel names.
- No raw raft command logs.
- No long-running agent handles in public artifacts unless the project later explicitly decides to disclose them.
- No private project history pasted into docs.

## If The Gate Fails

Do not silently redact and publish. Rewrite the source artifact so it is public-safe, then run the gate again.

