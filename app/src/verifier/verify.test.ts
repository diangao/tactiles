/**
 * Verifier tests (vitest)
 *
 * Validates `verify(goldIR, tactileIR) → FidelityReport` against the canonical
 * CHEM_FIXTURES set. Each happy-path fixture must round-trip identically; the
 * two engineered-failure fixtures (`acetic-acid` C=O drop, `ethylene` C=C
 * drop) must surface as `wrong_bond_order` regardless of which side carries
 * the drift.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { verify } from "./verify";
import { CHEM_FIXTURES, getFixture } from "../fixtures/chem";
import type { ChemIR } from "../harness/contracts";

beforeAll(async () => {
  // Warm rdkit-js WASM once so individual test timing doesn't include it.
  await verify(CHEM_FIXTURES[0].goldIR, CHEM_FIXTURES[0].goldIR);
});

describe("chemistry verifier — happy path (identity)", () => {
  for (const fx of CHEM_FIXTURES) {
    it(`${fx.id} — ${fx.name}: verify(gold, gold) passes cleanly`, async () => {
      const report = await verify(fx.goldIR, fx.goldIR);
      expect(report.pass).toBe(true);
      expect(report.diffs).toEqual([]);
      expect(report.checkedAt).toBeTruthy();
    });
  }
});

describe("chemistry verifier — engineered drift (money shots)", () => {
  const brokenCases = CHEM_FIXTURES.filter((fx) => fx.demoBrokenIR);

  it("at least one money-shot fixture exists", () => {
    expect(brokenCases.length).toBeGreaterThan(0);
  });

  for (const fx of brokenCases) {
    it(`${fx.id}: verify(gold, broken) catches wrong_bond_order`, async () => {
      const report = await verify(fx.goldIR, fx.demoBrokenIR!);
      expect(report.pass).toBe(false);
      const kinds = report.diffs.map((d) => d.kind);
      expect(kinds).toContain("wrong_bond_order");
      const severities = report.diffs.map((d) => d.severity);
      expect(severities).toContain("error");
    });
  }
});

describe("verifier invariants", () => {
  it("symmetry: bond-order swap is detected regardless of direction", async () => {
    const fx = getFixture("ethylene");
    expect(fx?.demoBrokenIR).toBeTruthy();
    const forward = await verify(fx!.goldIR, fx!.demoBrokenIR!);
    const backward = await verify(fx!.demoBrokenIR!, fx!.goldIR);
    expect(forward.pass).toBe(false);
    expect(backward.pass).toBe(false);
  });

  it("malformed SMILES on either side surfaces cleanly, no crash", async () => {
    // Test-local scaffolding: a parse-failure case is not a product fixture
    // (no demoable molecule to show), so it lives in the test, not chem.ts.
    const malformed: ChemIR = { smiles: "C=!=C", atoms: [], bonds: [] };
    const good = CHEM_FIXTURES[0].goldIR;
    const sourceBad = await verify(malformed, good);
    expect(sourceBad.pass).toBe(false);
    expect(sourceBad.diffs.length).toBeGreaterThan(0);
    const tactileBad = await verify(good, malformed);
    expect(tactileBad.pass).toBe(false);
    expect(tactileBad.diffs.length).toBeGreaterThan(0);
  });

  it("empty inputs do not crash", async () => {
    const empty: ChemIR = { smiles: "", atoms: [], bonds: [] };
    const report = await verify(empty, empty);
    expect(report.pass).toBe(false);
    expect(report.diffs.length).toBeGreaterThan(0);
    expect(report.diffs[0].severity).toBe("error");
  });
});
