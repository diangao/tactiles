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
  ir: ChemIR; // the IR this SVG was rendered from
  braille: BrailleLabel[];
  printSheet?: string; // emboss-ready A4 sheet: raised dots + lines, no chrome
};

// ── Deterministic NL edit ops ──────────────────────────────────────────────
// Teachers type natural language; the system routes intent to ONE of these
// fixed ops. The transform itself is fully deterministic — the model (if used)
// only picks the op label + bounded params, it never rewrites the SVG or the
// chemistry IR. Every op here is RENDERING-only: it can change how the diagram
// looks (size, weight, spacing, orientation, overlay text), but it can never
// change which molecule the diagram describes. That is the safety invariant
// the verifier depends on.
export type EditOp =
  | { kind: "enlargeLabels"; factor?: number }
  | { kind: "thickenLines"; factor?: number }
  | { kind: "emphasizeDoubleBonds" }
  | { kind: "spaceLabels"; factor?: number }
  | { kind: "removeBackground" }
  | { kind: "rotateDiagram"; degrees: 90 | 180 | -90 }
  | { kind: "moveLabel"; element: string; direction?: "out" | "up" | "down" }
  | { kind: "addAnnotation"; text: string }
  | { kind: "export"; format: "svg" | "pdf" };

export type EditOpKind = EditOp["kind"];

export const EDIT_OP_KINDS: readonly EditOpKind[] = [
  "enlargeLabels",
  "thickenLines",
  "emphasizeDoubleBonds",
  "spaceLabels",
  "removeBackground",
  "rotateDiagram",
  "moveLabel",
  "addAnnotation",
  "export",
];

// Cap on annotation text length so a hallucinated payload can't blow up the
// render or smuggle long content into the tactile sheet.
export const ANNOTATION_MAX_CHARS = 120;

// Single source of truth for what the UI presents as the supported edits.
// The chip row + error fallback list + server SYSTEM_PROMPT all consume this,
// so adding an op here propagates everywhere without string duplication.
export type EditOpPresentation = {
  kind: EditOpKind;
  label: string; // chip text
  example: string; // sample teacher phrasing
};

export const EDIT_OP_PRESENTATION: readonly EditOpPresentation[] = [
  { kind: "enlargeLabels", label: "bigger labels", example: "make the labels bigger" },
  { kind: "thickenLines", label: "thicken lines", example: "thicken the bond lines" },
  { kind: "emphasizeDoubleBonds", label: "emphasize double bonds", example: "make the double bonds clearer" },
  { kind: "spaceLabels", label: "space labels", example: "space the labels out" },
  { kind: "removeBackground", label: "remove background", example: "strip out the background detail" },
  { kind: "rotateDiagram", label: "rotate", example: "rotate the diagram 90 degrees" },
  { kind: "moveLabel", label: "move a label", example: "move the oxygen label away from the bond" },
  { kind: "addAnnotation", label: "add a note", example: "add a note: ‘watch the carbonyl carbon’" },
  { kind: "export", label: "export", example: "export as PDF" },
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
export type DiagramKind = "chemistry"; // future: "chart" | "graph"

export type AssetStatus =
  | "uploaded"
  | "parsed"
  | "compiled"
  | "verified"
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
