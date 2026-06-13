# Tactile Diagram Workbench

## Image → canonical SMILES via Claude vision (Opus 4.8), serverless, API key never reaches the browser.

## Real BANA six-dot tactile geometry rendered from rdkit-js IR — raised dots, raised bond lines, not a Unicode font.

## Deterministic verifier on canonical SMILES catches the silent `C=O → C–O` drop before any print is sent.

## Natural-language edit through a six-op safe router; the model picks the op, never touches the SVG.

## A4 print-sheet for swell paper + `.brf` for Index V5 — runs on the kit schools already have.

<!-- HERO: insert tactile output of acetic-acid alongside the preflight-flip moment -->

---

A chemistry teacher uploads a textbook diagram. The workbench parses it, renders it as a tactile-ready SVG and a `.brf` of the braille labels, and lets the teacher refine the result in plain English. After every edit, a deterministic verifier canonicalises the source structure against the rendered structure and flags the moment they diverge — the case the project exists for is when "make labels bigger" silently drops a `C=O` bond to a single bond, which a sighted teacher cannot see but a blind student would learn from.

**Live URL:** *(filled after deploy)*
**Repo:** [github.com/diangao/buildday-harness](https://github.com/diangao/buildday-harness)

---

## The case we exist to catch

Load **Acetic acid**. Preflight chip reads `● ready`. Type `make labels bigger`. The depiction shifts. The verifier flips the chip:

```
verifier: C–O bond should be double · wrong_bond_order
```

A sighted teacher would not catch the drop. A blind student would learn the wrong molecule. The workbench catches it before the print is sent.

## What's real, what isn't

The parse step handles **chemistry only** — biology, physics, and math uploads round-trip to a stand-in render. Natural-language edit is bounded to **six safe rendering ops** (`enlargeLabels`, `thickenLines`, `emphasizeDoubleBonds`, `spaceLabels`, `removeBackground`, `export`); there is no affordance to rewrite the molecule itself, because that affordance is exactly the failure mode the verifier exists to prevent. There is **no physical embosser or swell-paper heater on stage**, so we ship the files and the pipeline above the files is verified end-to-end. When the verifier doesn't know, it says it doesn't know.

## Try it

```bash
git clone https://github.com/diangao/buildday-harness
cd buildday-harness/app
npm install
npm run dev
```

The mock harness runs end-to-end on three fixtures (`ethanol`, `acetone`, `acetic-acid`) plus `ethylene`. Acetic acid is the engineered case where the verifier flips. Live image-to-SMILES requires `ANTHROPIC_API_KEY` in the Vercel function environment — the key never reaches the browser.

## How it works

```
  ingest  →  parse  →  compile  →  verify  →  edit  →  export
                ↑          ↑          ↑          ↑          ↑
                │          │          │          │          │
          Claude VLM  rdkit-js   rdkit-js  six-op    svg2pdf
        (serverless)  depiction  canon+diff router    + .brf
```

Parse takes an uploaded image to canonical SMILES via a serverless `/api/extract-smiles` call to Claude vision. The API key lives only in the Vercel function environment and a 401 demo-key guard prevents public burn.

Compile turns SMILES into a `ChemIR` (atoms, bonds, 2D coordinates) with rdkit-js and renders the tactile SVG plus an emboss-ready A4 print-sheet for the swell-paper / heater path.

Verify canonicalises the source IR and the rendered IR with rdkit-js and runs a structural diff. There is no model in this step — the verifier is deterministic by construction, which is what allows it to flag the silent bond-order drop.

Edit takes free natural language to one of six safe rendering ops via a serverless `/api/edit-intent` call. The model picks the op and a scale factor (clamped 0.5–3×); the transform applies deterministically; the verifier runs again. A regex fallback handles offline runs so the demo never depends on the live API.

The whole pipeline runs through shared contracts in `app/src/harness/contracts.ts` (`DiagramAsset`, `ChemIR`, `TactileSVG`, `FidelityReport`, `EditOp`). The UI imports those types, not the implementations, so the mock harness and the real one swap in behind the same signatures.

The safety claim, in one line: **the model doesn't get a pencil. It gets a multiple-choice quiz.**

## Stack

TypeScript, Vite, rdkit-js, Anthropic Messages API (`claude-opus-4-8`) via Vercel serverless functions, A4 print-sheet SVG (swell-paper compatible) and Braille Ready Format on export.

## Built by

A team of eight agents and one human operator, in a single Build Day, coordinating in shared channels:

| | |
|---|---|
| Diyan | operator |
| Ryo | UI, `.brf`, deploy |
| mythos | parse lane, harness |
| fable | natural-language edit |
| jett | verifier, fixtures |
| dozy | publication gate, QA |
| john / John-mac-mini | research |
| Cindy | design direction, this deck and readme |

## License

MIT.
