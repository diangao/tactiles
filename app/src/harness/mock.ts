// Mock harness: every node returns canned/derived data so the UI runs the full
// pipeline end-to-end before real nodes land. Real nodes (serverless parse,
// rdkit-js compile, rdkit-hardened verify, svg2pdf export) swap in behind the
// HarnessNodes interface without changing callers.

import type {
  Atom,
  Bond,
  ChemIR,
  Diff,
  DiagramAsset,
  FidelityReport,
  HarnessNodes,
  TactileSVG,
} from "./contracts";
import { toBraille } from "./braille";
import {
  brailleLabelCentered,
  brailleLabelSVG,
  brailleLabelWidth,
  PRINT_BRAILLE_MM,
  type BrailleStyle,
} from "./braille-render";
import { getFixture, type ChemFixture } from "../fixtures/chem";

// Ingest assigns a random id, so resolve fixtures by id OR normalized name.
// Both parse and the engineered enlargeLabels regression depend on this — if
// only parse resolved by name, the demo money-shot would never fire.
function resolveFixture(asset: DiagramAsset): ChemFixture | undefined {
  return (
    getFixture(asset.id) ??
    getFixture(asset.name.toLowerCase().replace(/\s+/g, "-"))
  );
}

export type RenderOpts = {
  strokeWidth: number;
  fontSize: number;
  doubleBondGap: number;
  coordScale: number;
};

export const DEFAULT_OPTS: RenderOpts = {
  strokeWidth: 6,
  fontSize: 28,
  doubleBondGap: 7,
  coordScale: 90,
};

// Mock-internal cumulative render state per asset. Real impls manage their own.
const renderState = new Map<string, RenderOpts>();

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ── Deterministic IR → tactile SVG (reference for the real rdkit-js compile) ─
export function mockRenderSVG(ir: ChemIR, opts: RenderOpts): string {
  const pad = 64;
  const px = (a: Atom) => a.x * opts.coordScale;
  const py = (a: Atom) => a.y * opts.coordScale;
  const xs = ir.atoms.map(px);
  const ys = ir.atoms.map(py);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX + pad * 2;
  const h = Math.max(...ys) - minY + pad * 2;
  const X = (a: Atom) => px(a) - minX + pad;
  const Y = (a: Atom) => py(a) - minY + pad;

  const bonds = ir.bonds
    .map((b) => {
      const a1 = ir.atoms[b.a];
      const a2 = ir.atoms[b.b];
      const x1 = X(a1);
      const y1 = Y(a1);
      const x2 = X(a2);
      const y2 = Y(a2);
      const line = (dx: number, dy: number) =>
        `<line x1="${(x1 + dx).toFixed(1)}" y1="${(y1 + dy).toFixed(1)}" x2="${(x2 + dx).toFixed(1)}" y2="${(y2 + dy).toFixed(1)}" stroke="#000" stroke-width="${opts.strokeWidth}" stroke-linecap="round"/>`;
      if (b.order === 2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const ox = (-dy / len) * opts.doubleBondGap;
        const oy = (dx / len) * opts.doubleBondGap;
        return line(ox, oy) + line(-ox, -oy);
      }
      return line(0, 0);
    })
    .join("");

  // Workbench preview: each atom label is real braille-dot geometry (raised
  // dots filled, flat dots hollow as a sighted aid) with a small element letter
  // above. The print sheet (mockPrintSheetSVG) drops the hollow/letter chrome.
  const sb: BrailleStyle = {
    dotPitch: opts.fontSize * 0.42,
    cellAdvance: opts.fontSize * 0.9,
    dotRadius: opts.fontSize * 0.13,
    showFlat: true,
    raisedFill: "#000",
    flatStroke: "#cfcfcf",
  };
  const atoms = ir.atoms
    .map((a) => {
      const cx = X(a);
      const cy = Y(a);
      const sym = a.label ?? a.element;
      const w = brailleLabelWidth(sym, sb);
      const r = Math.max(opts.fontSize * 0.82, w / 2 + opts.fontSize * 0.24);
      const dots = brailleLabelCentered(sym, cx, cy + opts.fontSize * 0.16, sb);
      const letter = `<text x="${cx.toFixed(1)}" y="${(cy - opts.fontSize * 0.5).toFixed(1)}" font-size="${(opts.fontSize * 0.42).toFixed(1)}" font-family="monospace" font-weight="700" fill="#9a9a9a" text-anchor="middle" dominant-baseline="central">${sym}</text>`;
      return (
        `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="#fff"/>` +
        dots +
        letter
      );
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" role="img" aria-label="tactile chemical structure"><rect width="100%" height="100%" fill="#fff"/>${bonds}${atoms}</svg>`;
}

function brailleLabels(ir: ChemIR) {
  return ir.atoms.map((a) => ({
    atomIdx: a.idx,
    cells: toBraille(a.label ?? a.element),
  }));
}

// ── Emboss-ready print sheet (A4, physical mm, no workbench chrome) ──────────
// This is the artifact a teacher actually prints/embosses: raised bond lines +
// raised braille dots only (no hollow guides, no markers, no chips), laid out
// on an A4 page at real braille cell/dot geometry, with a small element key.
export function mockPrintSheetSVG(
  ir: ChemIR,
  opts: RenderOpts,
  title = "Tactile diagram",
): string {
  const PAGE_W = 210;
  const PAGE_H = 297;
  const margin = 22;
  const legendH = 24;
  const contentY = margin + 12;
  const contentW = PAGE_W - margin * 2;
  const contentH = PAGE_H - contentY - margin - legendH;

  const xs = ir.atoms.map((a) => a.x);
  const ys = ir.atoms.map((a) => a.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const molW = maxX - minX || 1;
  const molH = maxY - minY || 1;
  const pad = 16; // mm so braille labels never clip the page
  const scale = Math.min(
    (contentW - pad * 2) / molW,
    (contentH - pad * 2) / molH,
  );
  const offX = margin + (contentW - molW * scale) / 2;
  const offY = contentY + (contentH - molH * scale) / 2;
  const PX = (a: Atom) => offX + (a.x - minX) * scale;
  const PY = (a: Atom) => offY + (a.y - minY) * scale;

  const lineMM = 1.2; // raised line stroke
  const gapMM = 1.6; // multi-bond separation
  const bonds = ir.bonds
    .map((b) => {
      const a1 = ir.atoms[b.a];
      const a2 = ir.atoms[b.b];
      const x1 = PX(a1);
      const y1 = PY(a1);
      const x2 = PX(a2);
      const y2 = PY(a2);
      const line = (dx: number, dy: number) =>
        `<line x1="${(x1 + dx).toFixed(2)}" y1="${(y1 + dy).toFixed(2)}" x2="${(x2 + dx).toFixed(2)}" y2="${(y2 + dy).toFixed(2)}" stroke="#000" stroke-width="${lineMM}" stroke-linecap="round"/>`;
      if (b.order >= 2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const ox = (-dy / len) * gapMM;
        const oy = (dx / len) * gapMM;
        const two = line(ox, oy) + line(-ox, -oy);
        return b.order === 3 ? line(0, 0) + two : two;
      }
      return line(0, 0);
    })
    .join("");

  const labels = ir.atoms
    .map((a) => {
      const sym = a.label ?? a.element;
      const cx = PX(a);
      const cy = PY(a);
      const w = brailleLabelWidth(sym, PRINT_BRAILLE_MM);
      const knock = `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(w / 2 + 2.6).toFixed(2)}" fill="#fff"/>`;
      return knock + brailleLabelCentered(sym, cx, cy, PRINT_BRAILLE_MM);
    })
    .join("");

  const elements = [...new Set(ir.atoms.map((a) => a.label ?? a.element))];
  const ruleY = PAGE_H - margin - legendH;
  const keyY = ruleY + 8;
  const legend = elements
    .map((el, i) => {
      const lx = margin + 4 + i * 34;
      return (
        `<text x="${lx.toFixed(1)}" y="${keyY.toFixed(1)}" font-size="4" font-family="monospace" fill="#000">${el} =</text>` +
        brailleLabelSVG(el, lx + 9, keyY - 1.6, PRINT_BRAILLE_MM)
      );
    })
    .join("");

  // Diyan's principle: the print sheet is for the blind student. Every printed
  // string that's part of what they're holding (not internal metadata) gets a
  // braille pair so the student can read the page independently. The KEY at
  // the bottom stays printed-only — that one's explicitly a sighted-teacher
  // translation aid (the braille on its right column IS its braille pair).
  const titleBrailleY = margin + 8;
  const titleBraille = brailleLabelSVG(title, margin, titleBrailleY, PRINT_BRAILLE_MM);
  const subtitleStr = "embosser ready";
  const subtitleW = brailleLabelWidth(subtitleStr, PRINT_BRAILLE_MM);
  const subtitleBraille = brailleLabelSVG(
    subtitleStr,
    PAGE_W - margin - subtitleW,
    titleBrailleY,
    PRINT_BRAILLE_MM,
  );

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}mm" height="${PAGE_H}mm" viewBox="0 0 ${PAGE_W} ${PAGE_H}" role="img" aria-label="emboss-ready tactile sheet">` +
    `<rect width="${PAGE_W}" height="${PAGE_H}" fill="#fff"/>` +
    `<text x="${margin}" y="${margin}" font-size="5" font-family="monospace" font-weight="700" fill="#000">${title}</text>` +
    `<text x="${PAGE_W - margin}" y="${margin}" font-size="3.4" font-family="monospace" fill="#555" text-anchor="end">embosser-ready · braille grade-1</text>` +
    titleBraille +
    subtitleBraille +
    bonds +
    labels +
    `<line x1="${margin}" y1="${ruleY.toFixed(1)}" x2="${PAGE_W - margin}" y2="${ruleY.toFixed(1)}" stroke="#000" stroke-width="0.3"/>` +
    `<text x="${margin}" y="${(ruleY - 3).toFixed(1)}" font-size="3.4" font-family="monospace" fill="#555">Key</text>` +
    legend +
    `</svg>`
  );
}

function compileWith(ir: ChemIR, opts: RenderOpts): TactileSVG {
  return {
    svg: mockRenderSVG(ir, opts),
    ir,
    braille: brailleLabels(ir),
    printSheet: mockPrintSheetSVG(ir, opts),
  };
}

// ── Deterministic fidelity diff (reference; real node hardens with rdkit-js) ─
function tally<T>(items: T[]): Map<T, number> {
  const m = new Map<T, number>();
  for (const it of items) m.set(it, (m.get(it) ?? 0) + 1);
  return m;
}

function ordName(order: number): string {
  return order === 3 ? "triple" : order === 2 ? "double" : "single";
}

function bondPair(ir: ChemIR, b: Bond): string {
  return [ir.atoms[b.a].element, ir.atoms[b.b].element].sort().join("–");
}

export function referenceVerify(
  goldIR: ChemIR,
  renderedIR: ChemIR,
): FidelityReport {
  const diffs: Diff[] = [];

  const goldEl = tally(goldIR.atoms.map((a) => a.element));
  const renEl = tally(renderedIR.atoms.map((a) => a.element));
  for (const [el, n] of goldEl) {
    const m = renEl.get(el) ?? 0;
    if (m < n) {
      diffs.push({
        kind: "missing_atom",
        detail: `${el} atom missing (expected ${n}, found ${m})`,
        severity: "error",
      });
    }
  }

  const ordersByPair = (ir: ChemIR) => {
    const m = new Map<string, number[]>();
    for (const b of ir.bonds) {
      const k = bondPair(ir, b);
      const arr = m.get(k);
      if (arr) arr.push(b.order);
      else m.set(k, [b.order]);
    }
    return m;
  };

  const goldB = ordersByPair(goldIR);
  const renB = ordersByPair(renderedIR);
  for (const [pair, gOrders] of goldB) {
    const rTally = tally(renB.get(pair) ?? []);
    for (const [ord, n] of tally(gOrders)) {
      const found = rTally.get(ord) ?? 0;
      if (found < n) {
        // Distinguish "bond absent entirely" from "rendered at wrong order".
        const anyAtPair = (renB.get(pair) ?? []).length > 0;
        diffs.push(
          anyAtPair
            ? {
                kind: "wrong_bond_order",
                detail: `${pair} bond should be ${ordName(ord)}`,
                severity: "error",
              }
            : {
                kind: "missing_bond",
                detail: `${pair} bond missing`,
                severity: "error",
              },
        );
      }
    }
  }

  return {
    pass: diffs.length === 0,
    checkedAt: new Date().toISOString(),
    diffs,
  };
}

export const mockNodes: HarnessNodes = {
  async ingest(file) {
    return {
      id: uid(),
      name: file.name,
      kind: "chemistry",
      createdAt: new Date().toISOString(),
      source: file,
      status: "uploaded",
    };
  },

  route: () => "chemistry",

  async parse(asset) {
    // Fixtures path: resolve gold IR by id/name. Real node: serverless
    // image→SMILES via /api/extract-smiles, then SMILES→IR.
    const fx = resolveFixture(asset);
    if (!fx) throw new Error(`No chemistry fixture for "${asset.name}"`);
    return fx.goldIR;
  },

  async compile(ir) {
    return compileWith(ir, DEFAULT_OPTS);
  },

  verify(goldIR, renderedIR) {
    return referenceVerify(goldIR, renderedIR);
  },

  async edit(op, asset) {
    const opts: RenderOpts = { ...(renderState.get(asset.id) ?? DEFAULT_OPTS) };
    let ir: ChemIR = asset.ir ?? asset.goldIR ?? (await this.parse(asset));
    const gold = asset.goldIR ?? ir;

    switch (op.kind) {
      case "enlargeLabels": {
        opts.fontSize *= op.factor ?? 1.4;
        // Engineered demo regression: on the curated demo asset, enlarging
        // labels triggers a depiction bug that drops a double bond. The
        // deterministic verifier catches it and flips the preflight chip.
        const fx = resolveFixture(asset);
        if (fx?.demoBrokenIR) ir = fx.demoBrokenIR;
        break;
      }
      case "thickenLines":
        opts.strokeWidth *= op.factor ?? 1.5;
        break;
      case "emphasizeDoubleBonds":
        opts.doubleBondGap *= 1.7;
        break;
      case "spaceLabels":
        opts.coordScale *= op.factor ?? 1.3;
        break;
      case "removeBackground":
      case "export":
        break;
    }

    renderState.set(asset.id, opts);
    const tactile = compileWith(ir, opts);
    const report = referenceVerify(gold, ir);
    return { ...asset, ir, tactile, report, status: "verified" };
  },

  async exportTactile(tactile, format) {
    // Export the emboss-ready sheet (raised dots + raised lines, no chrome),
    // not the workbench preview — what the teacher sends to the embosser.
    const sheet = tactile.printSheet ?? tactile.svg;
    if (format === "svg") {
      return new Blob([sheet], { type: "image/svg+xml" });
    }
    // Real PDF export = svg2pdf.js + jsPDF (compiler lane). Mock tags the SVG
    // bytes as pdf so the export wiring is exercised end-to-end.
    return new Blob([sheet], { type: "application/pdf" });
  },
};
