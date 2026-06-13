/**
 * Chemistry fixtures for the verifier (task #113).
 *
 * Purpose:
 *  - canned demo content that does not depend on the serverless /api/extract-smiles
 *  - happy-path cases the verifier should pass cleanly
 *  - one engineered failure case (dropped C=C double bond) that proves the verifier
 *    catches silent fidelity drift on a structure the audience can recognize
 *  - fallback cases for when source/output SMILES extraction fails
 *
 * Each fixture carries the source IR (what `parse` would return), the expected
 * post-compile tactileIR (what `compile` would emit), and the expected
 * FidelityReport (what `verify(goldIR, tactileIR)` should produce).
 *
 * Types will be swapped to `import type { ChemIR, FidelityReport }
 * from '../harness/contracts'` once mythos lands harness-foundation.
 */

type ChemIR = {
  smiles: string;
  atoms: { idx: number; element: string; x: number; y: number; label?: string }[];
  bonds: { a: number; b: number; order: 1 | 2 | 3; aromatic: boolean }[];
};

type Diff = {
  kind:
    | 'missing_atom'
    | 'missing_bond'
    | 'wrong_bond_order'
    | 'missing_label'
    | 'topology_mismatch';
  detail: string;
  severity: 'error' | 'warn';
};

type FidelityReport = {
  pass: boolean;
  checkedAt: string;
  diffs: Diff[];
};

type Fixture = {
  id: string;
  name: string;
  /** Display-only description for the asset chip / demo narration. */
  description: string;
  /** Source image — placeholder data URL for v0; replace with real renders before recording. */
  sourceImage: { mime: string; dataUrl: string };
  /** What `parse(asset)` should produce for this fixture. */
  goldIR: ChemIR;
  /** What `compile(goldIR)` will produce — happy path = same IR, engineered case = drift. */
  tactileIR: ChemIR;
  /** What `verify(goldIR, tactileIR)` should return. Used as snapshot in unit tests. */
  expectedReport: Omit<FidelityReport, 'checkedAt'>;
};

// Hand-drawn skeletal-formula SVGs for the three demo molecules. Imported as
// raw text and packaged as data URLs so a fixture can satisfy the harness'
// `source.dataUrl` requirement without the runtime needing the asset hosted.
// The dashed-card placeholder used in earlier drafts is gone — the workbench's
// left "source diagram" pane now shows the actual molecule the teacher would
// recognize from a textbook (closes Diyan's "upload should be a diagram, not
// text" feedback on PR #7).
import ethanolSvg from './diagrams/ethanol.svg?raw';
import acetoneSvg from './diagrams/acetone.svg?raw';
import ethyleneSvg from './diagrams/ethylene.svg?raw';

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const ETHANOL_SOURCE = { mime: 'image/svg+xml', dataUrl: svgDataUrl(ethanolSvg) };
const ACETONE_SOURCE = { mime: 'image/svg+xml', dataUrl: svgDataUrl(acetoneSvg) };
const ETHYLENE_SOURCE = { mime: 'image/svg+xml', dataUrl: svgDataUrl(ethyleneSvg) };

// Kept around for the SMILES-parse-failure fallback fixtures further down — they
// don't need a particular image and shouldn't fake one of the molecule renders.
const PLACEHOLDER_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// ----- A. Ethanol: simplest case, all single bonds, sanity check -----
const ethanol: Fixture = {
  id: 'fx-ethanol',
  name: 'Ethanol (CH₃CH₂OH)',
  description:
    'Two carbons, one oxygen, all single bonds. The simplest case — verifier should pass with no diffs.',
  sourceImage: ETHANOL_SOURCE,
  goldIR: {
    smiles: 'CCO',
    atoms: [
      { idx: 0, element: 'C', x: 0.30, y: 0.50 },
      { idx: 1, element: 'C', x: 0.50, y: 0.50 },
      { idx: 2, element: 'O', x: 0.70, y: 0.50, label: 'OH' },
    ],
    bonds: [
      { a: 0, b: 1, order: 1, aromatic: false },
      { a: 1, b: 2, order: 1, aromatic: false },
    ],
  },
  tactileIR: {
    smiles: 'CCO',
    atoms: [
      { idx: 0, element: 'C', x: 0.30, y: 0.50 },
      { idx: 1, element: 'C', x: 0.50, y: 0.50 },
      { idx: 2, element: 'O', x: 0.70, y: 0.50, label: 'OH' },
    ],
    bonds: [
      { a: 0, b: 1, order: 1, aromatic: false },
      { a: 1, b: 2, order: 1, aromatic: false },
    ],
  },
  expectedReport: {
    pass: true,
    diffs: [],
  },
};

// ----- B. Acetone: C=O double bond, happy path -----
const acetone: Fixture = {
  id: 'fx-acetone',
  name: 'Acetone (CH₃)₂C=O',
  description:
    'Two methyl groups around a carbonyl. Verifier should preserve the C=O double bond on the central carbon.',
  sourceImage: ACETONE_SOURCE,
  goldIR: {
    smiles: 'CC(=O)C',
    atoms: [
      { idx: 0, element: 'C', x: 0.20, y: 0.50 },
      { idx: 1, element: 'C', x: 0.40, y: 0.50 },
      { idx: 2, element: 'O', x: 0.40, y: 0.30, label: 'O' },
      { idx: 3, element: 'C', x: 0.60, y: 0.50 },
    ],
    bonds: [
      { a: 0, b: 1, order: 1, aromatic: false },
      { a: 1, b: 2, order: 2, aromatic: false },
      { a: 1, b: 3, order: 1, aromatic: false },
    ],
  },
  tactileIR: {
    smiles: 'CC(=O)C',
    atoms: [
      { idx: 0, element: 'C', x: 0.20, y: 0.50 },
      { idx: 1, element: 'C', x: 0.40, y: 0.50 },
      { idx: 2, element: 'O', x: 0.40, y: 0.30, label: 'O' },
      { idx: 3, element: 'C', x: 0.60, y: 0.50 },
    ],
    bonds: [
      { a: 0, b: 1, order: 1, aromatic: false },
      { a: 1, b: 2, order: 2, aromatic: false },
      { a: 1, b: 3, order: 1, aromatic: false },
    ],
  },
  expectedReport: {
    pass: true,
    diffs: [],
  },
};

// ----- C. ENGINEERED FAILURE: ethylene with dropped C=C -----
// This is the case Diyan watches: source has a C=C double bond, the compiled
// tactile silently drops it to a single bond. Verifier MUST catch it.
const ethyleneDroppedDoubleBond: Fixture = {
  id: 'fx-ethylene-dropped',
  name: 'Ethylene (engineered failure: dropped C=C)',
  description:
    'Source is ethylene (H₂C=CH₂) with the canonical carbon-carbon double bond. The tactile output silently downgrades to a single bond — verifier should surface "wrong bond order" and flag it for teacher review.',
  sourceImage: ETHYLENE_SOURCE,
  goldIR: {
    smiles: 'C=C',
    atoms: [
      { idx: 0, element: 'C', x: 0.40, y: 0.50 },
      { idx: 1, element: 'C', x: 0.60, y: 0.50 },
    ],
    bonds: [{ a: 0, b: 1, order: 2, aromatic: false }],
  },
  tactileIR: {
    smiles: 'CC', // single bond, drift!
    atoms: [
      { idx: 0, element: 'C', x: 0.40, y: 0.50 },
      { idx: 1, element: 'C', x: 0.60, y: 0.50 },
    ],
    bonds: [{ a: 0, b: 1, order: 1, aromatic: false }],
  },
  expectedReport: {
    pass: false,
    diffs: [
      {
        kind: 'wrong_bond_order',
        detail: 'Bond order swap on C-C: source vs tactile mismatch.',
        severity: 'error',
      },
    ],
  },
};

// ----- D. Fallback: source SMILES fails to parse -----
const sourceParseFailure: Fixture = {
  id: 'fx-fallback-source-fail',
  name: 'Fallback case: source SMILES unparseable',
  description:
    'Source parse returned junk SMILES (e.g. rendering of a hand-drawn glyph the LM misread). Verifier should fall back to a clear error rather than silently pass.',
  sourceImage: { mime: 'image/png', dataUrl: PLACEHOLDER_PNG },
  goldIR: {
    smiles: 'C=!=C', // intentionally malformed
    atoms: [],
    bonds: [],
  },
  tactileIR: {
    smiles: 'CC',
    atoms: [
      { idx: 0, element: 'C', x: 0.40, y: 0.50 },
      { idx: 1, element: 'C', x: 0.60, y: 0.50 },
    ],
    bonds: [{ a: 0, b: 1, order: 1, aromatic: false }],
  },
  expectedReport: {
    pass: false,
    diffs: [
      {
        kind: 'topology_mismatch',
        detail: 'Source SMILES failed to parse: "C=!=C"',
        severity: 'error',
      },
    ],
  },
};

// ----- E. Fallback: tactile SVG unparseable IR -----
const tactileParseFailure: Fixture = {
  id: 'fx-fallback-tactile-fail',
  name: 'Fallback case: tactile output unparseable',
  description:
    'Compiler produced an IR with broken SMILES. Verifier should report parse failure on the output side rather than silently pass.',
  sourceImage: { mime: 'image/png', dataUrl: PLACEHOLDER_PNG },
  goldIR: {
    smiles: 'CCO',
    atoms: [
      { idx: 0, element: 'C', x: 0.30, y: 0.50 },
      { idx: 1, element: 'C', x: 0.50, y: 0.50 },
      { idx: 2, element: 'O', x: 0.70, y: 0.50 },
    ],
    bonds: [
      { a: 0, b: 1, order: 1, aromatic: false },
      { a: 1, b: 2, order: 1, aromatic: false },
    ],
  },
  tactileIR: {
    smiles: '@@@', // garbage
    atoms: [],
    bonds: [],
  },
  expectedReport: {
    pass: false,
    diffs: [
      {
        kind: 'topology_mismatch',
        detail: 'Generated tactile SMILES failed to parse: "@@@"',
        severity: 'error',
      },
    ],
  },
};

export const fixtures: Fixture[] = [
  ethanol,
  acetone,
  ethyleneDroppedDoubleBond,
  sourceParseFailure,
  tactileParseFailure,
];

/**
 * Demo selector: which 3 fixtures show up as the top chips in the workbench.
 * Two happy-path cases bookend the engineered failure so the demo arc reads as:
 *   "this works" → "this works too" → "...wait, what would happen if compile drifted?"
 *   → click the engineered case → preflight chip turns red → fidelity panel.
 */
export const demoChips = [
  ethanol.id,
  acetone.id,
  ethyleneDroppedDoubleBond.id,
] as const;
