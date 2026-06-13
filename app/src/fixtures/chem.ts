// Curated chemistry fixtures with human-confirmed gold SMILES.
// These power three things at once:
//   1. the demo-safe path (no live OCR needed on stage),
//   2. the mock harness's canned data,
//   3. the verifier's ground truth.
//
// Two engineered money-shots ride along on `demoBrokenIR`:
//   - `acetic-acid`: enlarging labels drops the carbonyl C=O to a single bond.
//   - `ethylene`: a compile drift silently downgrades the C=C double bond.
// Both surface as `wrong_bond_order` from the deterministic verifier.

import type { ChemIR } from "../harness/contracts";
import { ETHANOL_SVG, ACETONE_SVG, ACETIC_ACID_SVG, ETHYLENE_SVG } from "./diagrams";

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export type FixtureImage = { mime: string; dataUrl: string };

export type ChemFixture = {
  id: string;
  name: string;
  formula: string;
  goldIR: ChemIR;
  // Present only on engineered demo cases: the (buggy) render an edit
  // produces, used to demonstrate the verifier catching a real regression.
  demoBrokenIR?: ChemIR;
  // Hand-drawn skeletal-formula SVG for the source pane. Absent for fixtures
  // where the source image is not part of the demo arc.
  sourceImage?: FixtureImage;
};

const ETHANOL_SOURCE: FixtureImage = {
  mime: "image/svg+xml",
  dataUrl: svgDataUrl(ETHANOL_SVG),
};
const ACETONE_SOURCE: FixtureImage = {
  mime: "image/svg+xml",
  dataUrl: svgDataUrl(ACETONE_SVG),
};
const ACETIC_ACID_SOURCE: FixtureImage = {
  mime: "image/svg+xml",
  dataUrl: svgDataUrl(ACETIC_ACID_SVG),
};
const ETHYLENE_SOURCE: FixtureImage = {
  mime: "image/svg+xml",
  dataUrl: svgDataUrl(ETHYLENE_SVG),
};

const ethanol: ChemIR = {
  smiles: "CCO",
  atoms: [
    { idx: 0, element: "C", x: 0, y: 0 },
    { idx: 1, element: "C", x: 1.2, y: 0.4 },
    { idx: 2, element: "O", x: 2.4, y: 0 },
  ],
  bonds: [
    { a: 0, b: 1, order: 1, aromatic: false },
    { a: 1, b: 2, order: 1, aromatic: false },
  ],
};

const acetone: ChemIR = {
  smiles: "CC(=O)C",
  atoms: [
    { idx: 0, element: "C", x: 0, y: 0 },
    { idx: 1, element: "C", x: 1.2, y: 0.4 },
    { idx: 2, element: "O", x: 1.2, y: 1.6 },
    { idx: 3, element: "C", x: 2.4, y: 0 },
  ],
  bonds: [
    { a: 0, b: 1, order: 1, aromatic: false },
    { a: 1, b: 2, order: 2, aromatic: false },
    { a: 1, b: 3, order: 1, aromatic: false },
  ],
};

const aceticAcidGold: ChemIR = {
  smiles: "CC(=O)O",
  atoms: [
    { idx: 0, element: "C", x: 0, y: 0 },
    { idx: 1, element: "C", x: 1.2, y: 0.4 },
    { idx: 2, element: "O", x: 1.2, y: 1.6 },
    { idx: 3, element: "O", x: 2.4, y: 0 },
  ],
  bonds: [
    { a: 0, b: 1, order: 1, aromatic: false },
    { a: 1, b: 2, order: 2, aromatic: false }, // C=O carbonyl
    { a: 1, b: 3, order: 1, aromatic: false },
  ],
};

// Same molecule, but the carbonyl C=O has been rendered as a single bond.
// SMILES tracks the broken structure so rdkit-backed verifiers (verify.ts)
// canonicalize the actual drift, not the gold structure.
const aceticAcidBroken: ChemIR = {
  ...aceticAcidGold,
  smiles: "CC(O)O",
  bonds: aceticAcidGold.bonds.map((b) =>
    b.a === 1 && b.b === 2 ? { ...b, order: 1 } : b,
  ),
};

const ethyleneGold: ChemIR = {
  smiles: "C=C",
  atoms: [
    { idx: 0, element: "C", x: 0, y: 0 },
    { idx: 1, element: "C", x: 1.2, y: 0 },
  ],
  bonds: [{ a: 0, b: 1, order: 2, aromatic: false }],
};

// Same molecule, but the C=C double bond has silently downgraded to a single
// bond — the canonical compile-drift case the verifier must catch.
const ethyleneBroken: ChemIR = {
  ...ethyleneGold,
  smiles: "CC",
  bonds: [{ a: 0, b: 1, order: 1, aromatic: false }],
};

export const CHEM_FIXTURES: ChemFixture[] = [
  {
    id: "ethanol",
    name: "Ethanol",
    formula: "C₂H₆O",
    goldIR: ethanol,
    sourceImage: ETHANOL_SOURCE,
  },
  {
    id: "acetone",
    name: "Acetone",
    formula: "C₃H₆O",
    goldIR: acetone,
    sourceImage: ACETONE_SOURCE,
  },
  {
    id: "acetic-acid",
    name: "Acetic acid",
    formula: "C₂H₄O₂",
    goldIR: aceticAcidGold,
    demoBrokenIR: aceticAcidBroken,
    sourceImage: ACETIC_ACID_SOURCE,
  },
  {
    id: "ethylene",
    name: "Ethylene",
    formula: "C₂H₄",
    goldIR: ethyleneGold,
    demoBrokenIR: ethyleneBroken,
    sourceImage: ETHYLENE_SOURCE,
  },
];

export function getFixture(id: string): ChemFixture | undefined {
  return CHEM_FIXTURES.find((f) => f.id === id);
}
