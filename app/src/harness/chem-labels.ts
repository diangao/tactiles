import type { Atom, ChemIR } from "./contracts";

const DEFAULT_VALENCE: Record<string, number> = {
  C: 4,
  N: 3,
  O: 2,
  S: 2,
  P: 3,
};

function bondValence(ir: ChemIR, atomIdx: number): number {
  return ir.bonds.reduce((sum, bond) => {
    if (bond.a !== atomIdx && bond.b !== atomIdx) return sum;
    return sum + (bond.aromatic ? 1.5 : bond.order);
  }, 0);
}

export function implicitHydrogenCount(ir: ChemIR, atom: Atom): number {
  if (typeof atom.hCount === "number" && Number.isFinite(atom.hCount)) {
    return Math.max(0, Math.round(atom.hCount));
  }
  if (atom.label) return 0;
  const valence = DEFAULT_VALENCE[atom.element];
  if (!valence) return 0;
  return Math.max(0, Math.round(valence - bondValence(ir, atom.idx)));
}

export function atomDisplayLabel(ir: ChemIR, atom: Atom): string {
  const explicit = atom.label ?? atom.element;
  const h = implicitHydrogenCount(ir, atom);
  if (h <= 0) return explicit;
  return `${explicit}H${h === 1 ? "" : h}`;
}

export function implicitHydrogenSummary(ir: ChemIR): string[] {
  return ir.atoms
    .map((atom) => {
      const h = implicitHydrogenCount(ir, atom);
      if (h <= 0) return null;
      return `${atom.element}${atom.idx + 1}: ${h === 1 ? "H" : `H${h}`}`;
    })
    .filter((line): line is string => Boolean(line));
}
