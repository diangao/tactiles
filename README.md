# Tactiles

Tactile-diagram compiler for blind STEM students. Chemistry comes out verified;
biology / physics / math come out as teacher-review drafts. Seconds, not weeks.

[Live demo](https://tactiles.vercel.app/) ·
[Build brief](docs/brief.md) ·
[Orchestration](docs/orchestration.md)

---

## What It Does

A teacher drops in a diagram from a worksheet, a textbook scan, a whiteboard
photo, or a prompt like "draw acetone." The workbench produces:

- an A4 SVG/PDF tactile sheet for raised-line printing on swell paper or a
  tactile-graphics embosser;
- a `.brf` braille-label file for standard text embossers;
- a visible trust chip that distinguishes verified chemistry from
  teacher-review drafts.

The intended workflow is not a new student-facing app. It is a fast authoring
tool for teachers and disability coordinators who already have a printer,
embosser, or swell-paper workflow.

## Why It Matters

Blind students often receive STEM diagrams days or weeks after the class uses
them, if they receive them at all. The alternatives are weak: order a specialist
tactile graphic, substitute text for the diagram, or skip the visual structure
entirely.

This project moves diagrams from a procurement task to a classroom task:
upload, verify, adjust, export.

## What Is Verified Today

| Input | Route | Output | Trust level |
| --- | --- | --- | --- |
| Chemistry diagram photo or sketch | Opus 4.8 vision to canonical SMILES, then rdkit-js | Tactile SVG/PDF + `.brf` | Verified |
| Chemistry concept, e.g. "aspirin" | Opus 4.8 concept-to-SMILES, then rdkit-js | Tactile SVG/PDF + `.brf` | Verified |
| Biology, physics, math, circuit, or map diagram | Universal tactile draft renderer | Raised-line draft + braille labels | Teacher review |

Chemistry has a deterministic verifier: the source molecule and rendered
structure are canonicalized with rdkit-js and compared after every edit. If an
edit silently drops a bond order, the workbench surfaces that mismatch instead
of exporting a broken sheet.

Other STEM subjects are supported as honest drafts. Their linework and labels
are converted into tactile form, but the UI marks them as teacher-review until a
subject-specific verifier exists.

## Natural-Language Edits

Teachers can ask for presentation changes such as:

- "make the labels bigger"
- "thicken the lines"
- "move the oxygen label away from the bond"
- "add a note: this is the reactive site"

The model maps free text to a bounded safe operation. The operation is then
applied deterministically; it does not rewrite the underlying chemistry.

## Architecture

```text
ingest -> route -> parse -> compile -> verify -> edit -> export
           |        |        |          |          |
           |        |        |          |          +-- SVG/PDF + .brf
           |        |        |          +------------- rdkit-js diff
           |        |        +------------------------ tactile renderer
           |        +--------------------------------- Opus 4.8, server-side
           +------------------------------------------ file / image / concept
```

The browser never receives API keys. Model calls live behind Vercel serverless
functions, and the app shares typed contracts between the mock harness, real
parse path, verifier, edit resolver, and UI.

Key code:

- `app/src/harness/contracts.ts` — shared data model and edit-op contracts
- `api/extract-smiles.ts` — image-to-SMILES endpoint
- `api/concept-to-smiles.ts` — concept-to-SMILES endpoint
- `api/edit-intent.ts` — natural-language edit resolver
- `app/src/harness/smiles-to-ir.ts` — rdkit-js structure compiler
- `app/src/harness/mock.ts` — tactile rendering and export harness

## Run Locally

```bash
git clone https://github.com/diangao/tactiles
cd tactiles/app
npm install
npm run dev
```

The local mock harness runs without secrets. Live image/concept parsing requires
`ANTHROPIC_API_KEY` in the serverless environment; it should never be placed in
browser code.

## Verification

```bash
npm run typecheck --prefix app
npm run test --prefix app
npm run selftest --prefix app
npm run build --prefix app
npm run gate
```

`npm run gate` also checks public artifacts for credentials, private-context
residue, and edit-op drift between the client contracts and serverless mirror.

## Boundaries

- Export-ready means SVG/PDF/BRF files for an existing tactile-print workflow,
  not direct hardware control.
- Non-chemistry diagrams are drafts until their own deterministic verifier
  exists.
- The verifier protects chemistry structure; it is not a classroom safety
  certification for every subject.

## License

MIT.
