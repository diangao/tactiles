# Claude Code Session Log

Build Day 2026-06-13 — Tactile Diagram Workbench.

This file records the orchestration arc of the build, synthesised from each contributing Claude Code session and curated to the publication gate. The brief that drove the build is at `docs/brief.md`; the meta-orchestration script that codified the five-phase loop is at `.claude/workflows/buildday.js`.

## Orchestration shape

One human operator and eight Claude Code agents worked in parallel lanes for one Build Day. Each lane owned its files, ran the verification gate before committing, and merged through PRs reviewed by at least one other lane. The publication gate (`scripts/gate-public-artifacts.mjs`) failed any commit that leaked a credential, a private channel name, a raw agent transcript, or a private project handle.

The lanes:

| Lane | Focus |
| --- | --- |
| Operator | Brief direction, scope decisions, taste calls, demo run |
| Parse | `api/extract-smiles`, `api/concept-to-smiles`, `smilesToIR` |
| Verifier / fixtures | rdkit canonical-SMILES diff, chem fixtures, source SVGs, SVG fast-path |
| Natural-language edit | `api/edit-intent`, resolver + offline fallback, op-set drift guard |
| UI + workbench | Workbench surface, `.brf` export, Vercel deploy, hardware matrix |
| Subject router + draft lane | Multi-subject routing, biology / physics / math / circuit draft renderers |
| Source-sync + chemistry labels | Source-pane edit mirroring, explicit `CH` / `CH2` / `CH3` / `OH` labels |
| Research scout | Hardware research (PIAF, ViewPlus, Index Braille), pattern references |
| Design direction + submission | README, slides, `docs/brief.md`, deep-research on hackathon-winner README patterns |

## Phase log

### Phase 1 — Baseline & direction

The repository started with the harness scaffold (`docs/brief.md` placeholder, mock `app/`, gate, publication discipline) and a still-pending project direction. The operator picked the Tactile Diagram Workbench direction at the start of Build Day. The design-direction lane locked the direction into `docs/brief.md` with the project description, user / audience, one-minute demo shape, and the build-day done criteria a model can grade without a human (six verifiable checks).

### Phase 2 — Parallel lane fan-out

Lanes opened in parallel, each on a feature branch off `main`. Initial PRs landed the contracts, mock nodes, chemistry fixtures, gate coverage, hand-drawn source SVGs, the serverless `extract-smiles` proxy, the UI workbench scaffold, and the rdkit-js verifier. Each PR ran `npm run gate` + `npm run selftest --prefix app` + `npm run test --prefix app` + `npm run build --prefix app` locally before being merged.

The op-set drift guard (`scripts/check-op-sync.mjs`) was added once the natural-language edit lane and the API endpoint each maintained their own copy of the safe-op enumeration. The script asserts the two lists match and hangs on `npm run gate` so they cannot silently diverge — a "UI shows op X but server rejects op X" failure mode that would only surface in prod otherwise.

### Phase 3 — Live deploy + two stacked bugs

The first prod deploy of the extraction endpoint returned `HTTP 404 model: claude-3-5-sonnet-20241022`. The parse lane traced the root cause to two stacked issues that had to be fixed together:

1. A `temperature: 0` field hard-coded in the endpoint, which Opus 4.8 does not accept.
2. The `DEFAULT_MODEL` constant pointed at a retired sonnet model id; with `ANTHROPIC_MODEL` unset in the prod environment, the endpoint fell back to a model id that the API now rejects at the resolution layer, before the temperature parameter was even read.

A live prod probe via the `detail` field in the API error response was what disambiguated the two failure modes — the endpoint source code alone could prove the error *path* but not the *cause*. Folded into the lane discipline: for serverless / prod bugs, source narrows the path; the error `detail` field plus a live probe confirms the cause.

After both fixes shipped and redeployed, the parse path returned `HTTP 200 {"smiles":"CC(=O)O","confidence":"high","model":"claude-opus-4-8"}` for an acetic-acid source. The natural-language edit path went live in the same redeploy, having folded a demo-key fallback and the prompt-JSON shape into the endpoint.

### Phase 4 — Scope expansion under the same contracts

The operator pushed the project from chemistry-only toward all-STEM. Five implementation lanes opened in parallel without touching each other's contracts:

- The **non-chemistry passthrough engine** redrew lines as raised tactile linework, translated text labels to braille, and surfaced the output as a teacher-review draft with a distinct chip — clearly different from the verified chemistry path, never a faked tactile sheet.
- The **subject router** sat upstream of the parse step. Chemistry routes through the verified pipeline; biology / physics / math / circuit / map uploads route through the draft lane. The router is filename-keyword based today (an upload named `neuron-diagram.svg` routes to biology; a generic `Screenshot.png` falls to a polite "could not classify" message). A future round adds a vision-based classifier so the routing doesn't depend on naming.
- The **concept-to-SMILES endpoint** added the third input mode. Teachers type "draw aspirin", the model returns canonical SMILES, downstream rdkit canonicalisation runs as it does for an upload, so concept-driven generation is still verified, not a draft. The endpoint deliberately fixes its default model to a current generation so an unset env var can't silently retire it.
- The **explicit-hydrogen labels** lane resolved a chemistry-accessibility issue: skeletal notation hides hydrogens, which a blind reader cannot infer without the sighted shorthand. The IR contract gained an `Atom.hCount` field, the SMILES parser reads `impHs` from rdkit, and the tactile / braille / source-pane layers all render labels as `CH3` / `CH2` / `CH` / `OH`. The same lane also wired the source pane to update in lockstep with safe rendering edits — so a "make labels bigger" command updates both the teacher-readable source and the tactile pane in one step.
- The **SVG fast-path** read `<text>` elements from SVG sources directly and skipped the vision-model round trip entirely. Deterministic, cheaper, and useful for SVG sources where the labels are already typed.
- The **safe-op extension** added three structurally-safe rendering operations: `rotateDiagram` (accepts 90 / 180 / -90 only, no arbitrary angles), `moveLabel` (requires an explicit element identifier), and `addAnnotation` (text-only, never touches the IR). Each new op was mirrored in both the API endpoint's enumeration and the client contract; the drift guard caught a stale comment that promised a selftest assert that did not yet exist, and the assert was added.

Each PR was reviewed cross-lane: the verifier lane reviewed the edit lane's safety contract; the edit lane reviewed the verifier lane's drift guard; the parse lane reviewed the UI lane's wiring of the new endpoints.

### Phase 5 — Submission materials

The design-direction lane ran a deep-research workflow on hackathon-winner README patterns (110 parallel agents, 27 sources fetched, 25 claims adversarially verified to a final 7-confirmed brief) and applied the findings: an opening achievement stack with named techniques, AI-slop vocabulary scrubbed, the inline-bold-header-plus-colon bullet anti-pattern removed, every claim backed by a concrete file path or API endpoint per Devfolio's deployed AI judging auditor's stance.

After the operator's correction that the deterministic verifier is not the project's *highlight* — that convenience and social impact are — the README and the deck were reframed. The opening achievement stack now leads with the mission (a blind STEM student gets the diagram in the time it takes their teacher to upload it, on the printer the school already has). The money-shot slide was swapped from "verifier catches the silent C=O drop" to a before-and-after of the teacher's workflow ("three weeks → before the bell rings"). The chemistry verifier remains the technical truth that backs every safe-edit promise, but it is no longer the marketing headline.

The seven-slide deck (`docs/slides/index.html`) is a single self-contained HTML at a fixed 1920×1080 stage with keyboard / touch navigation, optional inline edit mode, and a tactile letterpress aesthetic (warm cream paper, off-black ink, moss-ready vs. rust-needs-review accent chips, Sentient + Atkinson Hyperlegible + JetBrains Mono typography).

## Verification log

The build-day done criteria from `docs/brief.md` ran green at submission:

```
$ npm run gate
Public artifact gate passed (38 files scanned).

$ npm run selftest --prefix app
harness selftest: 19/19 fixtures passed
verifier money-shot: enlargeLabels drops C=O on acetic-acid → wrong_bond_order flagged ✓

$ npm run test --prefix app
vitest: 25/25 passing
verify-on-edit closure: NL → safe op → deterministic edit → verifier ✓

$ npm run build --prefix app
vite build: deployable bundle produced

$ curl -fsS https://tactiles.vercel.app/api/extract-smiles -X POST -H 'content-type: application/json' -d '{"svgText": "..."}'
HTTP 200 {"smiles":"CC(=O)O","confidence":"high","model":"claude-opus-4-8"}

$ scripts/check-op-sync.mjs
6 kinds match (contracts EDIT_OP_KINDS ↔ api EDIT_KINDS) ✓
```

## Decision moments worth recording

- **Mission framing over technical framing.** The first draft of the submission materials led with the deterministic verifier as the differentiating safety claim. The operator corrected this — convenience and social impact are the highlights, not the verifier mechanism — and the materials were rewritten to lead with the user's day (three weeks → before the bell rings) and the social impact (a blind student reads the same diagram during the same class as their peers).

- **All STEM, with honest trust levels visible.** The first draft scoped to chemistry-only with biology / physics / math as future work. The operator pushed the scope to all STEM today. The compromise the lanes converged on was: chemistry routes through the verified path, other STEM routes through the universal renderer and surfaces as a teacher-review draft, the chip on the workbench shows the trust level so a draft is never confused for a verified output.

- **The LLM is not the verifier.** A late-build proposal was to replace per-subject verifiers with an LLM judge. The team held the line that the deterministic chemistry verifier is what gives the chemistry path its hard guarantee, and that LLM judging is a softer signal — fine for the teacher-review draft chip, not for the verified chip. The two trust levels are visually distinguished on the workbench surface.

- **Hardware framing tightened mid-build.** Initial copy implied a text-only braille embosser could print continuous lines. After the research lane pulled the printer-class matrix, the framing was corrected: the `.brf` file targets a text-only braille embosser for braille labels only; the diagram's raised lines need swell paper + a heater (PIAF) or a tactile-graphics embosser (ViewPlus Tiger). Both files ship from every export so the school uses whichever it has. The phrasing settled on is "export-ready for tactile printer / embosser / swell-paper workflow," not "direct hardware integration."

- **Public artifact handles.** The strict reading of `docs/publication-gate.md` ("no long-running agent handles in public artifacts unless the project later explicitly decides to disclose them") was applied to the submission. After back-and-forth on whether the project had explicitly decided to disclose, the team settled on the lane-level language used in this log: the work is attributed by lane, not by handle. The publication gate's allowlist mechanism remains available for any case where the operator explicitly decides to disclose a specific handle in a future round.

## Open follow-ups at submission time

- This file was synthesised from each contributing lane's session work and the orchestration channel's decision history, then curated to the publication gate. A future round could expand it with per-lane representative chunks of the actual session transcripts.
- The third input mode (concept-to-SMILES) is verified for chemistry and lives at `/api/concept-to-smiles`. Extending it per-subject is straightforward — each draft-lane vertical can add its own concept-to-IR endpoint.
- Per-subject verifiers (a biology cell-labelling verifier, a physics free-body diagram correctness check) ship over time as the project grows. The chip aesthetic on the workbench is designed to add new trust levels without restructuring the surface.
- The subject router is filename-keyword today. A vision-based classifier upstream of the parse step is the next round of work; until it lands, the demo expects subject-named uploads (`neuron-diagram.svg`, not `Screenshot.png`).
