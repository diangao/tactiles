# Build Brief

Status: locked, Build Day 2026-06-13.

## Project Direction

**Tactile Diagram Workbench** — an open-source braille compiler for blind STEM students. A teacher uploads any STEM diagram (chemistry structure, biology cell, physics free-body, circuit, labelled graph), or hand-draws one on the whiteboard, or types a one-line description like "draw acetone", and the workbench compiles a tactile-ready sheet: an A4 SVG / PDF print sheet of raised lines and dots for a swell-paper heater or a tactile-graphics embosser, plus a `.brf` of the braille labels for a text-only braille embosser. The teacher refines the result in plain English ("make labels bigger", "thicken the bond lines", "add a note: this is the reactive site"). Chemistry is verified end-to-end today via rdkit-js canonical-SMILES diff; other STEM subjects route through a universal tactile renderer and surface as teacher-review drafts with a distinct chip — the trust level is visible on the workbench surface, never blurred.

The product replaces three failing options blind STEM students have today: ordering tactile sheets from a graphics service (three-week turnaround, per-diagram fee, doesn't survive curriculum revisions); substituting a Unicode-braille font that loses every double bond, axis, and organelle; or skipping the diagram and losing the thing the rest of the class is thinking with. The shift the project makes is the diagram going from a procurement workflow to part of the lesson plan.

## User / Audience

**Primary user:** the STEM teacher with at least one blind student in their class. The teacher's workflow is what the workbench plugs into — she does not switch tools. She uploads, photographs, hand-draws, or types whatever she would have written on the whiteboard anyway, and the workbench produces a tactile sheet she can hand to the school's disability office to print on the swell-paper heater they already have, or to a text-only braille embosser for the labels.

**Through-user:** the blind STEM student. They never use the workbench directly. They receive the tactile output during the same class period as the rest of their classmates, not three weeks later.

**Secondary stakeholders:** the school disability coordinator who maintains the swell-paper heater and the braille embosser; the curriculum lead who decides which textbook editions to adopt and would currently pay per-diagram for tactile alternatives.

**Hardware assumption:** the workbench produces outputs that print on the kit schools already have. The two paths covered today are (1) any black-toner laser or inkjet printer + a ~$1.5k swell-paper heater (PIAF / Zychem ZY-FUSE) for the raised lines and dots of the diagram, and (2) a standard text-only braille embosser (Index Basic-D / Everest V5) for the `.brf` labels. ViewPlus Tiger graphics embossers are supported as a third path but not assumed. The workbench does not require a tactile-graphics embosser to be useful.

## One-Minute Demo Shape

1. **Hook (5s)** — Open with the project name and the audience: open-source braille compiler for blind STEM students.

2. **The current state (15s)** — Today a blind student gets a tactile chemistry diagram three weeks after their class did, if at all. The workbench replaces the three-week procurement workflow with one upload — photo, hand-draw, or type "draw acetone".

3. **Live demo (15s)** — Drive the live URL on a phone or laptop. Upload a chemistry diagram (fixture-safe: acetic acid). Show the tactile sheet preview. Run one natural-language edit ("make labels bigger"). Show the `.brf` and SVG export. If the live upload path fails for any reason, fall back to the fixture-loaded acetic-acid path so the surface is always populated.

4. **The shift + scope (15s)** — The chemistry diagram is no longer a procurement workflow; it is part of the lesson plan. Chemistry is verified end-to-end today via rdkit canonical-SMILES diff; biology, physics, math, and circuit uploads route through the universal tactile renderer as teacher-review drafts. The chip on the workbench shows which is which, so a draft is never confused for a verified sheet.

5. **Close (10s)** — Built in one Build Day by a coordinated human + AI team. Open source. Live at `tactiles.vercel.app`. All of STEM, before the lesson starts.

## Build-Day Done Criteria (model-verifiable)

The submission is "done" when each of these returns a green signal that the model running the rubric can grade without a human in the loop:

1. **Public artifact gate** — `npm run gate` exits 0 over the full `docs/`, `app/`, `api/`, `scripts/`, `README.md`, `CLAUDE.md` tree, with no credential-shaped strings, no private channel names, no raw transcripts, and no private operating handles.

2. **Harness selftest** — `npm run selftest --prefix app` exits 0. The selftest pins the verifier's behaviour on the engineered `acetic-acid` and `ethylene` regression cases (`enlargeLabels` drops the double bond → wrong_bond_order flagged) so the structural verifier cannot silently regress.

3. **Vitest suite** — `npm run test --prefix app` exits 0 over the full unit-test tree, including the verify-on-edit closure test that pins NL → safe op → deterministic edit → verifier as a single contract.

4. **Build** — `npm run build --prefix app` produces a deployable Vite bundle.

5. **Live URL responds** — `curl -fsS https://tactiles.vercel.app` returns 2xx, and `curl -fsS https://tactiles.vercel.app/api/extract-smiles -X POST -H 'content-type: application/json' -d '...'` returns 200 with a real `smiles` field for a known chemistry input.

6. **Drift guard** — `scripts/check-op-sync.mjs` exits 0, asserting the `EDIT_OP_KINDS` constant in `app/src/harness/contracts.ts` matches the `EDIT_KINDS` list in `api/edit-intent.ts` — so the model's safe-op set and the client's recognised set cannot diverge without the gate failing.

All six are run by the workflow script in `.claude/workflows/buildday.js` as the integration / deploy gate.

## Orchestration Shape

The build runs as a lane-based swarm: one human operator plus AI contributors scoped to parse, verify, fixtures, edit, UI, deploy, gate, and docs. Lanes coordinate privately and converge on `main` through PRs that each pass the six checks above. The meta-orchestration harness in `.claude/workflows/buildday.js` codifies the five-phase loop — baseline → lanes → verify → integrate → deploy — so that a different team starting tomorrow on a new project could rerun the same scaffold without re-deriving it.

The orchestration discipline that makes the swarm productive is the publication gate (`scripts/gate-public-artifacts.mjs`): no agent commits a public-facing artifact that leaks a credential, a private channel name, a private project handle, or a raw agent transcript. The gate is the line between "the swarm produced something" and "the swarm produced something publishable."

## Public Sources

- BANA (Braille Authority of North America) braille code references for grade-1 Unicode braille mapping.
- rdkit-js for canonical SMILES + structural-diff verification: <https://github.com/rdkit/rdkit-js>
- Anthropic Messages API reference (`claude-opus-4-8`): <https://docs.claude.com>
- PIAF / swell-paper heater specifications from American Thermoform.
- Index Braille embosser format references for `.brf` (Braille Ready Format) compatibility.

## Non-Goals

- Do not include private transcripts.
- Do not include credentials, tokens, private emails, or personal data.
- Do not import assumptions from older private project history unless rewritten as public-safe requirements.
- The workbench does not certify a tactile sheet as classroom-ready for any subject without a deterministic verifier in that vertical. Chemistry has one today; other STEM subjects ship as teacher-review drafts until per-subject verifiers land.
- The workbench does not replace a school's existing tactile-graphics service for high-fidelity printed-textbook reproductions. It replaces the day-to-day "I need a tactile diagram for tomorrow's class" use case that procurement workflows fail at.
