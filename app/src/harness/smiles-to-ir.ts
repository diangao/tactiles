// SMILES → ChemIR: the real parse engine. Turns an arbitrary SMILES string
// (e.g. the one the serverless VLM reads off a photographed structure) into the
// structural IR the braille compiler and verifier consume — no fixtures, no
// preconfig. rdkit-js generates genuine 2D depiction coordinates; we read its
// V2000 molfile back into atoms (element + x/y) and bonds (order + aromatic).
//
// Lives behind the vitest WASM `?url` seam, NOT the esbuild selftest bundle —
// keep this module out of any import path that the selftest pulls in.

import * as rdkitPackage from "@rdkit/rdkit";
import rdkitWasmUrl from "@rdkit/rdkit/dist/RDKit_minimal.wasm?url";
import type { RDKitLoader, RDKitModule } from "@rdkit/rdkit";
import type { Atom, Bond, ChemIR } from "./contracts";

// RDKit WASM is heavy — init once. Loader mirrors verifier/verify.ts so both
// real nodes resolve the same node-vs-browser WASM path the same way.
const initRDKitModule = (rdkitPackage as unknown as { default: RDKitLoader }).default;
const globalRuntime = globalThis as typeof globalThis & {
  process?: { versions?: { node?: string } };
};
const rdkitNodeWasmPath = new URL(
  "../../node_modules/@rdkit/rdkit/dist/RDKit_minimal.wasm",
  import.meta.url,
).pathname;

let rdkitPromise: Promise<RDKitModule> | null = null;
function getRDKit(): Promise<RDKitModule> {
  if (!rdkitPromise) {
    rdkitPromise = initRDKitModule({
      locateFile: () =>
        globalRuntime.process?.versions?.node ? rdkitNodeWasmPath : rdkitWasmUrl,
    });
  }
  return rdkitPromise;
}

/**
 * Parse a SMILES string into a ChemIR with real 2D coordinates.
 *
 * SMILES → rdkit mol → CoordGen 2D depiction → V2000 molfile → atoms + bonds.
 * `smiles` is set to rdkit's canonical form so the verifier's canonical
 * fast-path lines up with what `parse()` produced.
 *
 * Throws on empty/invalid SMILES so the caller can surface a parse error
 * rather than emit a bogus IR.
 */
export async function smilesToIR(smiles: string): Promise<ChemIR> {
  const input = smiles.trim();
  if (!input) throw new Error("smilesToIR: empty SMILES");

  const RDKit = await getRDKit();
  const mol = RDKit.get_mol(input);
  if (!mol) throw new Error(`smilesToIR: invalid SMILES "${smiles}"`);

  try {
    if (!mol.is_valid()) throw new Error(`smilesToIR: invalid SMILES "${smiles}"`);
    const canonical = mol.get_smiles();
    mol.set_new_coords(true); // CoordGen 2D depiction
    return molblockToIR(mol.get_molblock(), canonical); // V2000, kekulized
  } finally {
    mol.delete();
  }
}

// V2000 molfile parser — fixed-width columns per the CTfile spec.
// Layout: 3 header lines, a counts line, then the atom block and bond block.
function molblockToIR(molblock: string, canonical: string): ChemIR {
  const lines = molblock.split(/\r?\n/);
  const counts = lines[3] ?? "";
  const nAtoms = parseInt(counts.slice(0, 3), 10);
  const nBonds = parseInt(counts.slice(3, 6), 10);
  if (!Number.isFinite(nAtoms) || !Number.isFinite(nBonds)) {
    throw new Error("smilesToIR: malformed molfile (no counts line)");
  }

  const atoms: Atom[] = [];
  for (let i = 0; i < nAtoms; i++) {
    const line = lines[4 + i];
    atoms.push({
      idx: i,
      element: line.slice(31, 34).trim(),
      x: parseFloat(line.slice(0, 10)),
      y: parseFloat(line.slice(10, 20)),
    });
  }

  const bonds: Bond[] = [];
  for (let j = 0; j < nBonds; j++) {
    const line = lines[4 + nAtoms + j];
    const type = parseInt(line.slice(6, 9), 10);
    bonds.push({
      a: parseInt(line.slice(0, 3), 10) - 1, // V2000 atom refs are 1-indexed
      b: parseInt(line.slice(3, 6), 10) - 1,
      order: type === 2 ? 2 : type === 3 ? 3 : 1,
      aromatic: type === 4,
    });
  }

  return { smiles: canonical, atoms, bonds };
}
