/**
 * Coverage for the rotate / moveLabel / addAnnotation safe-op extension
 * (task #135). Three guarantees the verifier story depends on:
 *
 *   1. Each new op is a pure RENDERING transform — the verifier sees the
 *      same molecule before and after, so chemistry safety is preserved.
 *   2. The free-text resolver maps reasonable phrasings to the right op
 *      (offline fallback path; LLM path is fable's lane).
 *   3. Input limits hold: rotation refuses bad angles, annotation clamps
 *      length, moveLabel demands an element.
 */

import { describe, it, expect } from "vitest";
import { resolveEditCommand, toEditOp } from "./edit-resolve";
import { mockNodes, referenceVerify } from "./mock";
import { ANNOTATION_MAX_CHARS } from "./contracts";
import type { ChemIR, DiagramAsset } from "./contracts";

const aceticIR: ChemIR = {
  smiles: "CC(=O)O",
  atoms: [
    { idx: 0, element: "C", x: 0, y: 0 },
    { idx: 1, element: "C", x: 1.2, y: 0.4 },
    { idx: 2, element: "O", x: 1.2, y: 1.6 },
    { idx: 3, element: "O", x: 2.4, y: 0 },
  ],
  bonds: [
    { a: 0, b: 1, order: 1, aromatic: false },
    { a: 1, b: 2, order: 2, aromatic: false },
    { a: 1, b: 3, order: 1, aromatic: false },
  ],
};

function assetFromIR(id: string, ir: ChemIR): DiagramAsset {
  return {
    id,
    name: id,
    kind: "chemistry",
    createdAt: "2026-06-13T00:00:00.000Z",
    source: { name: id, mime: "image/svg+xml", dataUrl: "" },
    goldIR: ir,
    ir,
    status: "parsed",
  };
}

describe("rotateDiagram — chemistry safety", () => {
  it("rotates atoms, leaves bonds/orders intact, verifier stays clean", async () => {
    const asset = assetFromIR("free-acetic", aceticIR);
    const out = await mockNodes.edit({ kind: "rotateDiagram", degrees: 90 }, asset);

    expect(out.report?.pass).toBe(true);
    expect(out.report?.diffs).toEqual([]);
    expect(out.ir?.atoms.length).toBe(aceticIR.atoms.length);
    expect(out.ir?.bonds).toEqual(aceticIR.bonds);
    // Some coordinate actually moved (otherwise we silently rotated by 0).
    expect(out.ir?.atoms.some((a, i) => a.x !== aceticIR.atoms[i].x || a.y !== aceticIR.atoms[i].y)).toBe(true);
  });

  it("rejects unsupported angles instead of silently defaulting", () => {
    expect(toEditOp({ kind: "rotateDiagram", degrees: 45 })).toBeNull();
    expect(toEditOp({ kind: "rotateDiagram" })).toBeNull();
    expect(toEditOp({ kind: "rotateDiagram", degrees: 90 })).toEqual({
      kind: "rotateDiagram",
      degrees: 90,
    });
  });

  it("resolver maps natural rotate phrasings to a valid op (offline)", async () => {
    for (const phrase of ["rotate the diagram", "spin it 180 degrees", "flip the molecule upside down"]) {
      const r = await resolveEditCommand(phrase, { localOnly: true });
      expect(r.op?.kind).toBe("rotateDiagram");
    }
  });
});

describe("moveLabel — chemistry safety", () => {
  it("only moves the named element, leaves bonds/orders intact", async () => {
    const asset = assetFromIR("free-acetic", aceticIR);
    const out = await mockNodes.edit({ kind: "moveLabel", element: "O", direction: "out" }, asset);

    expect(out.report?.pass).toBe(true);
    expect(out.report?.diffs).toEqual([]);
    expect(out.ir?.bonds).toEqual(aceticIR.bonds);
    // Both O atoms moved; C atoms did not.
    const moved = out.ir!.atoms.map((a, i) => a.x !== aceticIR.atoms[i].x || a.y !== aceticIR.atoms[i].y);
    expect(moved).toEqual([false, false, true, true]);
  });

  it("refuses moves without an element", () => {
    expect(toEditOp({ kind: "moveLabel" })).toBeNull();
    expect(toEditOp({ kind: "moveLabel", element: "" })).toBeNull();
    expect(toEditOp({ kind: "moveLabel", element: "O" })).toEqual({
      kind: "moveLabel",
      element: "O",
      direction: "out",
    });
  });

  it("resolver pulls the element from natural phrasing (offline)", async () => {
    const r = await resolveEditCommand(
      "move the oxygen label away from the bond",
      { localOnly: true },
    );
    expect(r.op).toEqual({ kind: "moveLabel", element: "O", direction: "out" });
  });
});

describe("addAnnotation — bounded text overlay", () => {
  it("renders the caption in the tactile sheet, verifier stays clean", async () => {
    const asset = assetFromIR("free-acetic", aceticIR);
    const out = await mockNodes.edit(
      { kind: "addAnnotation", text: "watch the carbonyl carbon" },
      asset,
    );

    expect(out.report?.pass).toBe(true);
    expect(out.report?.diffs).toEqual([]);
    expect(out.tactile?.printSheet).toMatch(/watch the carbonyl carbon/);
  });

  it("clamps text length and rejects empty text", () => {
    const long = "x".repeat(ANNOTATION_MAX_CHARS + 80);
    const op = toEditOp({ kind: "addAnnotation", text: long });
    expect(op?.kind).toBe("addAnnotation");
    expect((op as { kind: "addAnnotation"; text: string }).text.length).toBe(ANNOTATION_MAX_CHARS);

    expect(toEditOp({ kind: "addAnnotation", text: "" })).toBeNull();
    expect(toEditOp({ kind: "addAnnotation", text: "   " })).toBeNull();
  });

  it("escapes XML-special characters so a stray '<' can't corrupt the SVG", async () => {
    const asset = assetFromIR("free-acetic", aceticIR);
    const out = await mockNodes.edit(
      { kind: "addAnnotation", text: "<script>alert(1)</script>" },
      asset,
    );
    // The literal tags must not survive into the SVG; the escaped entities should.
    expect(out.tactile?.printSheet).not.toMatch(/<script>/);
    expect(out.tactile?.printSheet).toMatch(/&lt;script&gt;/);
  });

  it("resolver pulls quoted or post-colon text from natural phrasing (offline)", async () => {
    const r = await resolveEditCommand(
      'add a note: "watch the carbonyl"',
      { localOnly: true },
    );
    expect(r.op).toEqual({ kind: "addAnnotation", text: "watch the carbonyl" });
  });
});

describe("verifier-on-edit closure — the 3 new ops never break chemistry", () => {
  const phrases: Array<[string, string]> = [
    ["rotate the diagram 90 degrees", "rotateDiagram"],
    ["move the oxygen label away from the bond", "moveLabel"],
    ['add a note: "watch the carbonyl"', "addAnnotation"],
  ];

  for (const [phrase, kind] of phrases) {
    it(`${kind}: verify(gold, post-edit ir) stays clean for "${phrase}"`, async () => {
      const res = await resolveEditCommand(phrase, { localOnly: true });
      expect(res.op?.kind).toBe(kind);
      const asset = assetFromIR("free-acetic", aceticIR);
      const out = await mockNodes.edit(res.op!, asset);
      const verdict = referenceVerify(aceticIR, out.ir!);
      expect(verdict.pass).toBe(true);
    });
  }
});
