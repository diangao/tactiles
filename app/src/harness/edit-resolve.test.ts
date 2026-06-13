import { describe, it, expect } from "vitest";
import { resolveEditCommand, toEditOp, describeOp } from "./edit-resolve";
import { mockNodes } from "./mock";
import type { ChemIR, DiagramAsset } from "./contracts";

// A fake /api/edit-intent that returns whatever op we hand it. Lets us prove
// the LLM path without a live key, and the fallback path by throwing.
function stubFetch(payload: unknown, ok = true): typeof fetch {
  return (async () =>
    ({
      ok,
      status: ok ? 200 : 500,
      json: async () => payload,
    }) as unknown as Response) as unknown as typeof fetch;
}

function throwingFetch(): typeof fetch {
  return (async () => {
    throw new Error("network down");
  }) as unknown as typeof fetch;
}

describe("toEditOp", () => {
  it("accepts the safe rendering kinds", () => {
    expect(toEditOp({ kind: "emphasizeDoubleBonds" })).toEqual({
      kind: "emphasizeDoubleBonds",
    });
    expect(toEditOp({ kind: "removeBackground" })).toEqual({
      kind: "removeBackground",
    });
  });

  it("carries and clamps a scale factor", () => {
    expect(toEditOp({ kind: "enlargeLabels", factor: 1.5 })).toEqual({
      kind: "enlargeLabels",
      factor: 1.5,
    });
    // hallucinated 50× is clamped, not passed through
    expect(toEditOp({ kind: "thickenLines", factor: 50 })).toEqual({
      kind: "thickenLines",
      factor: 3,
    });
    expect(toEditOp({ kind: "spaceLabels", factor: 0.01 })).toEqual({
      kind: "spaceLabels",
      factor: 0.5,
    });
  });

  it("defaults export format to svg and honors pdf", () => {
    expect(toEditOp({ kind: "export" })).toEqual({ kind: "export", format: "svg" });
    expect(toEditOp({ kind: "export", format: "pdf" })).toEqual({
      kind: "export",
      format: "pdf",
    });
  });

  it("rejects 'none', unknown kinds, and junk", () => {
    expect(toEditOp({ kind: "none" })).toBeNull();
    expect(toEditOp({ kind: "deleteMolecule" })).toBeNull();
    expect(toEditOp(null)).toBeNull();
    expect(toEditOp("enlargeLabels")).toBeNull();
  });
});

describe("resolveEditCommand — deterministic floor", () => {
  it("maps known phrasings offline (localOnly)", async () => {
    const r = await resolveEditCommand("make the labels bigger", { localOnly: true });
    expect(r.op).toEqual({ kind: "enlargeLabels" });
    expect(r.source).toBe("fallback");
  });

  it("returns none for an empty instruction without any network call", async () => {
    const r = await resolveEditCommand("   ", { localOnly: true });
    expect(r).toEqual({ op: null, source: "none" });
  });
});

describe("resolveEditCommand — LLM path", () => {
  it("uses the endpoint result and reports source=llm", async () => {
    const r = await resolveEditCommand("these letters are way too tiny to feel", {
      fetchImpl: stubFetch({
        op: { kind: "enlargeLabels", factor: 1.8 },
        reason: "labels too small",
        model: "claude-opus-4-8",
      }),
    });
    expect(r.op).toEqual({ kind: "enlargeLabels", factor: 1.8 });
    expect(r.source).toBe("llm");
    expect(r.model).toBe("claude-opus-4-8");
  });

  it("falls back to the regex floor when the endpoint errors", async () => {
    const r = await resolveEditCommand("make the labels bigger", {
      fetchImpl: throwingFetch(),
    });
    expect(r.op).toEqual({ kind: "enlargeLabels" });
    expect(r.source).toBe("fallback");
  });

  it("falls back when the model says none but the regex still matches", async () => {
    const r = await resolveEditCommand("thicken the bond lines please", {
      fetchImpl: stubFetch({ op: null, reason: "n/a" }),
    });
    expect(r.op).toEqual({ kind: "thickenLines" });
    expect(r.source).toBe("fallback");
  });

  it("resolves to none when neither the model nor the regex matches", async () => {
    const r = await resolveEditCommand("what is the boiling point of water", {
      fetchImpl: stubFetch({ op: null, reason: "off-topic" }),
    });
    expect(r.op).toBeNull();
    expect(r.source).toBe("none");
  });
});

describe("resolveEditCommand — end-to-end into edit()", () => {
  // Inline 2-atom IR so this test has zero fixture dependency (decoupled from
  // the chem.ts canonical migration).
  const ir: ChemIR = {
    smiles: "CC",
    atoms: [
      { idx: 0, element: "C", x: 0, y: 0 },
      { idx: 1, element: "C", x: 1, y: 0 },
    ],
    bonds: [{ a: 0, b: 1, order: 1, aromatic: false }],
  };
  const asset: DiagramAsset = {
    id: "test-ethane",
    name: "ethane",
    kind: "chemistry",
    createdAt: "2026-06-13T00:00:00.000Z",
    source: { name: "ethane", mime: "image/svg+xml", dataUrl: "" },
    goldIR: ir,
    ir,
    status: "parsed",
  };

  it("free text → safe op → deterministic edit() → clean verify", async () => {
    const res = await resolveEditCommand("can you space the labels out a bit", {
      fetchImpl: stubFetch({ op: { kind: "spaceLabels", factor: 1.3 }, reason: "crowded" }),
    });
    expect(res.op).toEqual({ kind: "spaceLabels", factor: 1.3 });

    const out = await mockNodes.edit(res.op!, asset);
    expect(out.status).toBe("verified");
    expect(out.tactile?.printSheet).toBeTruthy();
    // spaceLabels doesn't touch the chemistry → verifier stays clean.
    expect(out.report?.pass).toBe(true);
  });

  it("describeOp renders a chip string for the UI", () => {
    expect(describeOp({ kind: "enlargeLabels", factor: 1.5 })).toBe(
      "enlarge labels ×1.5",
    );
    expect(describeOp({ kind: "export", format: "pdf" })).toBe("export PDF");
  });
});
