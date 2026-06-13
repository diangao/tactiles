# Publication Gate

Run `npm run gate` before committing public submission materials.

The gate scans public docs plus source files under `app/` and `api/`. Generated
and vendor output such as `node_modules/`, `dist/`, `.vercel/`, `.next/`, and
coverage directories are intentionally skipped.

## Must Pass

- No credential-shaped strings.
- No private emails.
- No private channel names.
- No raw raft command logs.
- No long-running agent handles in public artifacts unless the project later explicitly decides to disclose them.
- No private project history pasted into docs.

## If The Gate Fails

Do not silently redact and publish. Rewrite the source artifact so it is public-safe, then run the gate again.
