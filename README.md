# Tactile Diagram Workbench

## Image → canonical SMILES via Claude vision (Opus 4.8), serverless, API key never reaches the browser.

## Real BANA six-dot tactile geometry rendered from rdkit-js IR — raised dots, raised bond lines, not a Unicode font.

## Deterministic verifier on canonical SMILES catches the silent `C=O → C–O` drop before any print is sent.

## Natural-language edit through a six-op safe router; the model picks the op, never touches the SVG.

## A4 SVG / PDF for swell paper (or a tactile-graphics embosser) carries the diagram lines · `.brf` for a text-only braille embosser carries the labels — runs on the kit schools already have.

<!-- HERO: insert tactile output of acetic-acid alongside the preflight-flip moment -->

---

A chemistry teacher uploads a textbook diagram. The workbench parses it, renders an A4 SVG / PDF print sheet that carries the diagram's raised lines and dots together (the form a swell-paper heater or a tactile-graphics embosser actually prints) and a `.brf` that carries the braille text labels for a text-only braille embosser. The teacher refines the result in plain English. After every edit, a deterministic verifier canonicalises the source structure against the rendered structure and flags the moment they diverge — the case the project exists for is when "make labels bigger" silently drops a `C=O` bond to a single bond, which a sighted teacher cannot see but a blind student would learn from.

**Live URL:** [buildday-harness.vercel.app](https://buildday-harness.vercel.app)
**Repo:** [github.com/diangao/buildday-harness](https://github.com/diangao/buildday-harness)

---

## The case we exist to catch

Load **Acetic acid**. Preflight chip reads `● ready`. Type `make labels bigger`. The depiction shifts. The verifier flips the chip:

```
verifier: C–O bond should be double · wrong_bond_order
```

A sighted teacher would not catch the drop. A blind student would learn the wrong molecule. The workbench catches it before the print is sent.

## What's real, what isn't

**Chemistry** is the only subject the workbench translates end-to-end today. The pipeline parses the source image into canonical SMILES, compiles it into a tactile sheet with raised bond lines and braille atom labels, and verifies it against rdkit-js canonicalisation on every edit. Biology, physics, and math uploads currently surface as the original image with no tactile translation — a multi-subject router and per-subject draft lanes are in flight to land them as honest drafts that say so on the chip, not as faked tactile output.

Natural-language edit is bounded to a small set of **structure-safe rendering ops**; there is no affordance to rewrite the molecule itself, because that affordance is exactly the failure mode the verifier exists to prevent.

The diagram's raised lines need a swell-paper heater (the cheap path schools already have) or a tactile-graphics embosser to come out as continuous raised line work — a text-only braille embosser only puts down the `.brf` labels, not the diagram itself. There is **no physical hardware on stage**, so we ship both files. When the verifier doesn't know, it says it doesn't know.

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

## Stack

TypeScript, Vite, rdkit-js, Anthropic Messages API (`claude-opus-4-8`) via Vercel serverless functions, A4 print-sheet SVG for swell paper or a tactile-graphics embosser, and Braille Ready Format for standard text embossers.

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
