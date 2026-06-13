// Shared contracts for the tactile-diagram harness.
// Nodes are decoupled through these types: the UI builds against mock nodes
// first, and real nodes (serverless parse, rdkit-js compile, deterministic
// verify) swap in behind the same signatures without touching callers.

// ── Structural IR (chemistry) ──────────────────────────────────────────────
export type Atom = {
  idx: number;
  element: string; // "C", "O", "N", ...
  x: number; // 2D depiction coordinate
  y: number;
  label?: string; // explicit label override
};

export type Bond = {
  a: number; // atom idx
  b: number; // atom idx
  order: 1 | 2 | 3;
  aromatic: boolean;
};

export type ChemIR = {
  smiles: string; // canonical SMILES = source of truth
  atoms: Atom[];
  bonds: Bond[];
};

// ── Tactile render output ──────────────────────────────────────────────────
export type BrailleLabel = {
  atomIdx: number;
  cells: string; // grade-1 unicode braille
};

export type TactileSVG = {
  svg: string; // workbench tactile preview (braille dots + thick bonds)
  ir: ChemIR; // chemistry IR this SVG was rendered from; empty for non-chem drafts
  draftKind?: DiagramKind; // non-chem tactile draft lane, not verifier-backed
  braille: BrailleLabel[];
  printSheet?: string; // emboss-ready A4 sheet: raised dots + lines, no chrome
};

// ── Deterministic NL edit ops ──────────────────────────────────────────────
// Teachers type natural language; the system routes intent to ONE of these
// fixed ops. The transform itself is fully deterministic — the model (if used)
// only picks the op label, it never rewrites the SVG.
export type EditOp =
  | { kind: "enlargeLabels"; factor?: number }
  | { kind: "thickenLines"; factor?: number }
  | { kind: "emphasizeDoubleBonds" }
  | { kind: "spaceLabels"; factor?: number }
  | { kind: "removeBackground" }
  | { kind: "export"; format: "svg" | "pdf" };

export type EditOpKind = EditOp["kind"];

export const EDIT_OP_KINDS: readonly EditOpKind[] = [
  "enlargeLabels",
  "thickenLines",
  "emphasizeDoubleBonds",
  "spaceLabels",
  "removeBackground",
  "export",
];

// ── Fidelity preflight ─────────────────────────────────────────────────────
export type DiffKind =
  | "missing_atom"
  | "missing_bond"
  | "wrong_bond_order"
  | "missing_label"
  | "topology_mismatch";

export type Diff = {
  kind: DiffKind;
  detail: string;
  severity: "error" | "warn";
};

export type FidelityReport = {
  pass: boolean;
  checkedAt: string; // ISO timestamp
  diffs: Diff[];
};

// ── Asset (library unit) ───────────────────────────────────────────────────
export type DiagramKind =
  | "chemistry"
  | "circuit"
  | "geometry"
  | "graph"
  | "biology"
  | "map"
  | "physics"
  | "unknown";

export type AssetStatus =
  | "uploaded"
  | "parsed"
  | "compiled"
  | "verified"
  | "draft"
  | "error";

export type UploadedFile = {
  name: string;
  mime: string;
  dataUrl: string; // base64 data URL of the original upload
  page?: number; // for multi-page PDF
};

export type DiagramAsset = {
  id: string;
  name: string;
  kind: DiagramKind;
  createdAt: string; // ISO timestamp
  source: UploadedFile;
  goldIR?: ChemIR; // ground-truth IR (fixture or parse result)
  ir?: ChemIR; // current working IR after edits
  tactile?: TactileSVG;
  report?: FidelityReport;
  status: AssetStatus;
};

// ── Harness node signatures ────────────────────────────────────────────────
// The dynamic-workflow pipeline: ingest → route → parse → compile → verify →
// edit → export. Mock and real implementations share this interface.
export interface HarnessNodes {
  ingest(file: UploadedFile): Promise<DiagramAsset>;
  route(asset: DiagramAsset): DiagramKind;
  parse(asset: DiagramAsset): Promise<ChemIR>;
  compile(ir: ChemIR): Promise<TactileSVG>;
  verify(goldIR: ChemIR, renderedIR: ChemIR): FidelityReport;
  edit(op: EditOp, asset: DiagramAsset): Promise<DiagramAsset>;
  exportTactile(tactile: TactileSVG, format: "svg" | "pdf"): Promise<Blob>;
}
