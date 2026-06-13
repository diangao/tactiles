/**
 * Concept-parse node tests (vitest)
 *
 * Proves the third front door: a typed concept → SMILES (stubbed proxy, no live
 * key) → real ChemIR (rdkit 2D depiction) → emboss-ready braille sheet. The LLM
 * call is stubbed so the test is deterministic, but everything downstream of the
 * SMILES is the genuine engine — same rdkit + compile the upload path uses.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { realConceptParse } from "./concept-parse";
import { smilesToIR } from "./smiles-to-ir";
import { mockNodes } from "./mock";

// A fake /api/concept-to-smiles that returns whatever payload we hand it.
function stubFetch(payload: unknown, ok = true): typeof fetch {
  return (async () =>
    ({
      ok,
      status: ok ? 200 : 500,
      json: async () => payload,
    }) as unknown as Response) as unknown as typeof fetch;
}

beforeAll(async () => {
  // Warm rdkit-js WASM once so per-test timing excludes the heavy init.
  await smilesToIR("C");
});

describe("realConceptParse — concept text becomes a real, compilable structure", () => {
  it("aspirin: SMILES from the proxy → multi-element IR → emboss-ready sheet", async () => {
    const ir = await realConceptParse("aspirin", {
      fetchImpl: stubFetch({
        smiles: "CC(=O)Oc1ccccc1C(=O)O",
        name: "aspirin",
        confidence: "high",
        warnings: [],
        model: "claude-opus-4-8",
      }),
    });

    const elements = new Set(ir.atoms.map((a) => a.element));
    expect(elements.has("C")).toBe(true);
    expect(elements.has("O")).toBe(true);
    expect(ir.atoms.length).toBeGreaterThan(10); // aspirin has 13 heavy atoms
    expect(ir.bonds.length).toBeGreaterThan(0);
    expect(ir.smiles).toBeTruthy(); // rdkit canonical form, not the raw model string

    // Same deterministic compile the upload path runs → real tactile sheet.
    const tactile = await mockNodes.compile(ir);
    expect(tactile.braille.length).toBe(ir.atoms.length);
    expect(tactile.printSheet).toContain('width="210mm"');
  });

  it("rejects an empty concept without any network call", async () => {
    let called = false;
    const spyFetch = (async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    }) as unknown as typeof fetch;

    await expect(realConceptParse("   ", { fetchImpl: spyFetch })).rejects.toThrow(/empty/);
    expect(called).toBe(false);
  });

  it("rejects when the concept names no single molecule, surfacing the model warning", async () => {
    await expect(
      realConceptParse("alcohols", {
        fetchImpl: stubFetch({
          smiles: null,
          name: null,
          confidence: "low",
          warnings: ["'alcohols' is a class of molecules, not one structure"],
        }),
      }),
    ).rejects.toThrow(/no molecule.*class of molecules/);
  });
});
