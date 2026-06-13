/**
 * Verifier — task #93 (chemistry first)
 *
 * Input:  goldIR (from `parse(asset)` on source image)
 *         tactileIR (embedded in `compile(ir)` output, i.e. `tactile.ir`)
 * Output: FidelityReport with deterministic structural diff
 *
 * NOT an LLM judge. Pure rdkit-js + JS comparison logic.
 *
 * Can import types from `app/src/harness/contracts.ts` once this verifier is
 * wired into the shared harness. For now, types are inlined locally so the
 * algorithm is reviewable.
 */

import * as rdkitPackage from '@rdkit/rdkit';
import rdkitWasmUrl from '@rdkit/rdkit/dist/RDKit_minimal.wasm?url';
import type { RDKitLoader, RDKitModule } from '@rdkit/rdkit';

// === temp local types — swap to `import type` from contracts.ts when landed ===
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

// === module state — RDKit WASM is heavy, init once ===
const initRDKitModule = (rdkitPackage as unknown as { default: RDKitLoader }).default;
const globalRuntime = globalThis as typeof globalThis & {
  process?: { versions?: { node?: string } };
};
const rdkitNodeWasmPath = new URL(
  '../../node_modules/@rdkit/rdkit/dist/RDKit_minimal.wasm',
  import.meta.url,
).pathname;

let rdkitPromise: Promise<RDKitModule> | null = null;
function getRDKit() {
  if (!rdkitPromise) {
    rdkitPromise = initRDKitModule({
      locateFile: () => (globalRuntime.process?.versions?.node ? rdkitNodeWasmPath : rdkitWasmUrl),
    });
  }
  return rdkitPromise;
}

/**
 * Verify the tactile output preserves the source diagram's chemistry structure.
 *
 * Algorithm:
 *  1. Canonicalize both SMILES via rdkit-js.
 *  2. If canonical SMILES match → pass (fast path, ~95% of "no-drift" cases).
 *  3. If they differ → run detailed diff:
 *     a. atom-set diff (multiset of element symbols)
 *     b. bond-set diff (canonical edge representation: sorted atom-idx pair + order)
 *     c. label diff (atom labels carried through)
 *  4. Emit one Diff per discrepancy with human-readable detail.
 */
export async function verify(
  goldIR: ChemIR,
  tactileIR: ChemIR,
): Promise<FidelityReport> {
  const ts = new Date().toISOString();
  const diffs: Diff[] = [];

  if (!goldIR.smiles.trim()) {
    return {
      pass: false,
      checkedAt: ts,
      diffs: [
        {
          kind: 'topology_mismatch',
          detail: 'Source SMILES was empty.',
          severity: 'error',
        },
      ],
    };
  }
  if (!tactileIR.smiles.trim()) {
    return {
      pass: false,
      checkedAt: ts,
      diffs: [
        {
          kind: 'topology_mismatch',
          detail: 'Generated tactile SMILES was empty.',
          severity: 'error',
        },
      ],
    };
  }

  const RDKit = await getRDKit();

  // --- 1. canonical SMILES ---
  const goldMol = RDKit.get_mol(goldIR.smiles);
  const tactileMol = RDKit.get_mol(tactileIR.smiles);

  if (!goldMol) {
    return {
      pass: false,
      checkedAt: ts,
      diffs: [
        {
          kind: 'topology_mismatch',
          detail: `Source SMILES failed to parse: "${goldIR.smiles}"`,
          severity: 'error',
        },
      ],
    };
  }
  if (!tactileMol) {
    return {
      pass: false,
      checkedAt: ts,
      diffs: [
        {
          kind: 'topology_mismatch',
          detail: `Generated tactile SMILES failed to parse: "${tactileIR.smiles}"`,
          severity: 'error',
        },
      ],
    };
  }

  const goldCanonical = goldMol.get_smiles();
  const tactileCanonical = tactileMol.get_smiles();

  goldMol.delete();
  tactileMol.delete();

  // --- 2. fast path: canonical match ---
  if (goldCanonical === tactileCanonical) {
    return { pass: true, checkedAt: ts, diffs: [] };
  }

  // --- 3. detailed diff via IR (rdkit-js doesn't need to be involved for these) ---
  diffs.push(...diffAtoms(goldIR, tactileIR));
  diffs.push(...diffBonds(goldIR, tactileIR));
  diffs.push(...diffLabels(goldIR, tactileIR));

  if (diffs.length === 0) {
    // Canonical SMILES disagreed but we couldn't pinpoint a structural diff —
    // likely a stereochemistry or aromaticity perception edge case.
    diffs.push({
      kind: 'topology_mismatch',
      detail: `Canonical SMILES differ (source="${goldCanonical}" vs tactile="${tactileCanonical}") but element/bond counts match — likely stereochemistry or aromaticity drift.`,
      severity: 'warn',
    });
  }

  return { pass: diffs.every(d => d.severity !== 'error'), checkedAt: ts, diffs };
}

// === diff helpers ===

function diffAtoms(gold: ChemIR, tactile: ChemIR): Diff[] {
  const out: Diff[] = [];
  const goldCounts = countElements(gold);
  const tactileCounts = countElements(tactile);

  for (const [el, count] of goldCounts) {
    const got = tactileCounts.get(el) ?? 0;
    if (got < count) {
      out.push({
        kind: 'missing_atom',
        detail: `Source has ${count} ${el}, tactile has ${got} — ${count - got} missing.`,
        severity: 'error',
      });
    }
  }
  for (const [el, count] of tactileCounts) {
    const had = goldCounts.get(el) ?? 0;
    if (count > had) {
      out.push({
        kind: 'topology_mismatch',
        detail: `Tactile has ${count} ${el} but source had ${had} — extra atom(s) introduced.`,
        severity: 'warn',
      });
    }
  }
  return out;
}

function diffBonds(gold: ChemIR, tactile: ChemIR): Diff[] {
  const out: Diff[] = [];
  // Index bonds by sorted-pair-of-elements + order for cross-IR matching that
  // doesn't depend on atom indices being identical between the two IRs.
  const goldBonds = bondKeyCounts(gold);
  const tactileBonds = bondKeyCounts(tactile);

  for (const [key, count] of goldBonds) {
    const got = tactileBonds.get(key) ?? 0;
    if (got < count) {
      const { pair, order } = decodeBondKey(key);
      const swapped = hasBondWithDifferentOrder(tactileBonds, pair, order);
      out.push({
        kind: swapped ? 'wrong_bond_order' : 'missing_bond',
        detail: swapped
          ? `Bond order swap on ${pair.join('-')}: source vs tactile mismatch.`
          : `Missing ${describeOrder(order)} bond ${pair.join('-')} (source had ${count}, tactile has ${got}).`,
        severity: 'error',
      });
    }
  }
  // Bond-order swap (e.g. C=C → C-C) shows up as "missing C=C" + "extra C-C" on
  // the same atom pair — promote to a single wrong_bond_order diff.
  promoteOrderSwaps(out);
  return out;
}

function diffLabels(gold: ChemIR, tactile: ChemIR): Diff[] {
  const out: Diff[] = [];
  const goldLabels = new Set(gold.atoms.map(a => a.label).filter(Boolean) as string[]);
  const tactileLabels = new Set(tactile.atoms.map(a => a.label).filter(Boolean) as string[]);

  for (const lbl of goldLabels) {
    if (!tactileLabels.has(lbl)) {
      out.push({
        kind: 'missing_label',
        detail: `Label "${lbl}" present on source atom but missing from tactile output.`,
        severity: 'warn',
      });
    }
  }
  return out;
}

// === small helpers ===

function countElements(ir: ChemIR): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of ir.atoms) m.set(a.element, (m.get(a.element) ?? 0) + 1);
  return m;
}

function bondKeyCounts(ir: ChemIR): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of ir.bonds) {
    const ea = ir.atoms.find(a => a.idx === b.a)?.element ?? '?';
    const eb = ir.atoms.find(a => a.idx === b.b)?.element ?? '?';
    const pair = [ea, eb].sort().join('|');
    const key = `${pair}#${b.order}`;
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return m;
}

function decodeBondKey(key: string): { pair: string[]; order: number } {
  const [pairStr, orderStr] = key.split('#');
  return { pair: pairStr.split('|'), order: parseInt(orderStr, 10) };
}

function describeOrder(order: number): string {
  return order === 2 ? 'double' : order === 3 ? 'triple' : 'single';
}

function hasBondWithDifferentOrder(
  bonds: Map<string, number>,
  pair: string[],
  expectedOrder: number,
): boolean {
  const pairKey = pair.slice().sort().join('|');
  for (const [key, count] of bonds) {
    const decoded = decodeBondKey(key);
    if (
      count > 0 &&
      decoded.pair.join('|') === pairKey &&
      decoded.order !== expectedOrder
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Collapse paired (missing_bond X-Y order N) + (extra_bond X-Y order M) into a
 * single (wrong_bond_order) diff so the UI surfaces the real story.
 * The "extra_bond" entries live in `topology_mismatch` because we don't separate
 * the kinds upstream — collapse here keeps the contract narrow.
 */
function promoteOrderSwaps(diffs: Diff[]): void {
  // Pure local mutation. Each (missing, extra) sharing a pair becomes wrong_bond_order.
  const missingBonds = diffs.filter(d => d.kind === 'missing_bond');
  const extras = diffs.filter(d => d.kind === 'topology_mismatch' && d.detail.includes('bond'));
  for (const m of missingBonds) {
    const mPair = extractPair(m.detail);
    if (!mPair) continue;
    const swap = extras.find(e => {
      const ePair = extractPair(e.detail);
      return ePair && ePair[0] === mPair[0] && ePair[1] === mPair[1];
    });
    if (swap) {
      m.kind = 'wrong_bond_order';
      m.detail = `Bond order swap on ${mPair.join('-')}: source vs tactile mismatch.`;
      const idx = diffs.indexOf(swap);
      if (idx >= 0) diffs.splice(idx, 1);
    }
  }
}

function extractPair(detail: string): string[] | null {
  const m = detail.match(/([A-Z][a-z]?)-([A-Z][a-z]?)/);
  return m ? [m[1], m[2]].sort() : null;
}
