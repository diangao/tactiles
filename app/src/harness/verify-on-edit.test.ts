/**
 * End-to-end closure: a teacher's natural-language instruction is mapped
 * through the resolver (PR #13), applied by the deterministic edit() node,
 * and the verifier (PR #8) gates the result. The money shot: even when the
 * resolver does its job, a render-time depiction bug can still drop a bond,
 * and the verifier MUST surface it as `wrong_bond_order` — no silent passes.
 *
 * Uses the `acetic-acid` fixture from CHEM_FIXTURES whose `demoBrokenIR`
 * encodes the engineered drift the harness injects on enlargeLabels.
 */

import { describe, it, expect } from "vitest";
import { resolveEditCommand } from "./edit-resolve";
import { mockNodes } from "./mock";
import { getFixture } from "../fixtures/chem";
import type { DiagramAsset } from "./contracts";

function assetFromFixture(id: string): DiagramAsset {
  const fx = getFixture(id);
  if (!fx) throw new Error(`fixture "${id}" not found`);
  return {
    id: fx.id,
    name: fx.id, // mockNodes.resolveFixture matches on asset.name
    kind: "chemistry",
    createdAt: "2026-06-13T00:00:00.000Z",
    source: { name: fx.id, mime: "image/svg+xml", dataUrl: "" },
    goldIR: fx.goldIR,
    ir: fx.goldIR,
    status: "parsed",
  };
}

describe("verify-on-edit closure (NL → safe op → deterministic edit → verifier gate)", () => {
  it("acetic-acid: free text 'make the labels bigger' → enlargeLabels → verifier flags wrong_bond_order", async () => {
    const res = await resolveEditCommand("make the labels bigger", {
      localOnly: true,
    });
    // Resolver picked the rendering op the teacher meant. Nothing structural.
    expect(res.op?.kind).toBe("enlargeLabels");

    const asset = assetFromFixture("acetic-acid");
    const out = await mockNodes.edit(res.op!, asset);

    // The deterministic harness injected demoBrokenIR; the verifier MUST catch
    // the dropped C=O double bond instead of silently passing the render.
    expect(out.report?.pass).toBe(false);
    const diffKinds = out.report?.diffs.map((d) => d.kind) ?? [];
    expect(diffKinds).toContain("wrong_bond_order");

    // The tactile output still rendered (export path is independent of pass).
    expect(out.tactile?.printSheet).toBeTruthy();
  });

  it("ethylene: free text → enlargeLabels → verifier flags the dropped C=C", async () => {
    // mockNodes.edit injects demoBrokenIR on enlargeLabels for any fixture
    // that has one — so the same closure also fires for ethylene's C=C drop.
    const res = await resolveEditCommand("make the labels bigger", {
      localOnly: true,
    });
    const asset = assetFromFixture("ethylene");
    const out = await mockNodes.edit(res.op!, asset);

    expect(out.report?.pass).toBe(false);
    const diffKinds = out.report?.diffs.map((d) => d.kind) ?? [];
    expect(diffKinds).toContain("wrong_bond_order");
  });

  it("happy-path render op on a fixture without demoBrokenIR leaves the verifier clean", async () => {
    const res = await resolveEditCommand("space the labels out", {
      localOnly: true,
    });
    expect(res.op?.kind).toBe("spaceLabels");

    const asset = assetFromFixture("ethanol");
    const out = await mockNodes.edit(res.op!, asset);
    expect(out.report?.pass).toBe(true);
    expect(out.report?.diffs).toEqual([]);
  });
});
