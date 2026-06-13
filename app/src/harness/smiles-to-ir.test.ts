/**
 * Real parse-engine tests (vitest)
 *
 * Proves `smilesToIR(smiles) → ChemIR` on ARBITRARY, non-fixture molecules —
 * the live, no-preconfigure path. rdkit-js generates genuine 2D coordinates and
 * we read its V2000 molfile back into atoms + bonds, then run that IR through
 * the same compile step the workbench uses to confirm it reaches an
 * emboss-ready braille sheet. No fixture lookup anywhere in this file.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { smilesToIR } from "./smiles-to-ir";
import { mockNodes } from "./mock";

beforeAll(async () => {
  // Warm rdkit-js WASM once so per-test timing excludes the heavy init.
  await smilesToIR("C");
});

describe("smilesToIR — arbitrary molecules get real 2D structure", () => {
  it("benzene (c1ccccc1): 6 carbons, real depiction coords, kekulized ring", async () => {
    const ir = await smilesToIR("c1ccccc1");

    expect(ir.atoms.length).toBe(6);
    expect(ir.atoms.every((a) => a.element === "C")).toBe(true);
    expect(ir.bonds.length).toBe(6);

    // Genuine 2D depiction — atoms are spread out, not stacked at the origin.
    const distinctX = new Set(ir.atoms.map((a) => a.x.toFixed(3)));
    const distinctY = new Set(ir.atoms.map((a) => a.y.toFixed(3)));
    expect(distinctX.size).toBeGreaterThan(1);
    expect(distinctY.size).toBeGreaterThan(1);

    // get_molblock() is kekulized, so the aromatic ring round-trips as
    // alternating single/double bonds rather than an aromatic flag.
    expect(ir.bonds.some((b) => b.order === 2)).toBe(true);

    // smiles is rdkit's canonical form, not whatever we fed in.
    expect(ir.smiles).toBeTruthy();
  });

  it("caffeine: multi-element IR compiles to an emboss-ready braille sheet", async () => {
    const ir = await smilesToIR("CN1C=NC2=C1C(=O)N(C)C(=O)N2C");

    const elements = new Set(ir.atoms.map((a) => a.element));
    expect(elements.has("C")).toBe(true);
    expect(elements.has("N")).toBe(true);
    expect(elements.has("O")).toBe(true);
    expect(ir.atoms.length).toBeGreaterThan(10);

    const tactile = await mockNodes.compile(ir);

    // One braille label per atom — the tactile layer matches the structure.
    expect(tactile.braille.length).toBe(ir.atoms.length);

    // A4 emboss sheet with raised dots drawn as real filled circles, NOT the
    // hollow guide rings (fill="none") that are preview-only and emboss as noise.
    expect(tactile.printSheet).toContain('width="210mm"');
    expect(tactile.printSheet).toContain("<circle");
    expect(tactile.printSheet).not.toContain('fill="none"');
  });
});

describe("smilesToIR — rejects unparseable input", () => {
  it("throws on empty / whitespace SMILES", async () => {
    await expect(smilesToIR("   ")).rejects.toThrow(/empty/);
  });

  it("throws on a structurally invalid SMILES (unclosed ring)", async () => {
    await expect(smilesToIR("C1CCCCC")).rejects.toThrow(/invalid SMILES/);
  });
});
