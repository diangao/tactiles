#!/usr/bin/env node
// Drift guard for the NL-edit op set.
//
// The safe-edit op kinds live in TWO places that must stay identical:
//   - app/src/harness/contracts.ts  → EDIT_OP_KINDS   (the app's source of truth)
//   - api/edit-intent.ts            → EDIT_KINDS       (a MANUAL mirror)
//
// The serverless function lives outside the Vite/app build graph, so it can't
// import the contract — the list is hand-copied. If someone adds an op to one
// and forgets the other, the UI/classifier and the endpoint silently disagree
// (UI offers an op the server rejects, or vice versa). A unit test can't catch
// this because the api/ file isn't importable from the app test runner, so we
// compare the two lists textually here and wire this into `npm run gate`.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Pull the string literals out of a named `const NAME = [ ... ]` array block.
function extractKinds(file, name) {
  const src = readFileSync(join(root, file), "utf8");
  const decl = src.match(new RegExp(`${name}\\s*(?::[^=]+)?=\\s*\\[([\\s\\S]*?)\\]`));
  if (!decl) {
    throw new Error(`Could not find array \`${name}\` in ${file}`);
  }
  const kinds = [...decl[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
  if (kinds.length === 0) {
    throw new Error(`\`${name}\` in ${file} parsed to an empty list`);
  }
  return kinds;
}

const contract = extractKinds("app/src/harness/contracts.ts", "EDIT_OP_KINDS");
const endpoint = extractKinds("api/edit-intent.ts", "EDIT_KINDS");

const cSet = new Set(contract);
const eSet = new Set(endpoint);
const missingInEndpoint = contract.filter((k) => !eSet.has(k));
const missingInContract = endpoint.filter((k) => !cSet.has(k));

if (missingInEndpoint.length || missingInContract.length) {
  console.error("Op-set drift between the app contract and the serverless mirror:");
  if (missingInEndpoint.length) {
    console.error(
      `  - in contracts.ts EDIT_OP_KINDS but NOT in api/edit-intent.ts EDIT_KINDS: ${missingInEndpoint.join(", ")}`,
    );
  }
  if (missingInContract.length) {
    console.error(
      `  - in api/edit-intent.ts EDIT_KINDS but NOT in contracts.ts EDIT_OP_KINDS: ${missingInContract.join(", ")}`,
    );
  }
  console.error("Add the op to BOTH lists (plus toEditOp on both sides + the SYSTEM_PROMPT).");
  process.exit(1);
}

console.log(`Op-set in sync: ${contract.length} kinds match across contract + serverless mirror.`);
