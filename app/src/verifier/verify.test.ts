/**
 * Verifier tests (vitest)
 *
 * Validates `verify(goldIR, tactileIR) → FidelityReport` against the chemistry
 * fixtures. Each fixture carries an `expectedReport`; we snapshot-match by
 * essential fields (pass, kinds of diffs, severity) rather than by exact
 * `detail` strings so non-essential message tweaks don't break the suite.
 *
 * To land in: `app/src/verifier/verify.test.ts`
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { verify } from './verify';
import { fixtures } from '../fixtures/chemistry';

beforeAll(async () => {
  // Warm rdkit-js WASM once so individual test timing doesn't include it.
  // verify() lazy-inits, so calling it on the smallest fixture suffices.
  const sanity = fixtures[0];
  await verify(sanity.goldIR, sanity.goldIR);
});

describe('chemistry verifier', () => {
  for (const fx of fixtures) {
    it(`${fx.id} — ${fx.name}`, async () => {
      const report = await verify(fx.goldIR, fx.tactileIR);

      // pass/fail must match the documented expectation
      expect(report.pass).toBe(fx.expectedReport.pass);

      // diff kinds + severities must match (string `detail` allowed to drift)
      const gotKinds = report.diffs.map(d => `${d.kind}#${d.severity}`).sort();
      const wantKinds = fx.expectedReport.diffs
        .map(d => `${d.kind}#${d.severity}`)
        .sort();
      expect(gotKinds).toEqual(wantKinds);

      // checkedAt must be set
      expect(report.checkedAt).toBeTruthy();
    });
  }
});

describe('verifier invariants', () => {
  it('identity: verify(ir, ir) always passes for parseable SMILES', async () => {
    for (const fx of fixtures) {
      // Skip cases where the gold itself is the bad input (the fallbacks).
      if (fx.id.startsWith('fx-fallback-source')) continue;
      const report = await verify(fx.goldIR, fx.goldIR);
      expect(report.pass).toBe(true);
      expect(report.diffs).toEqual([]);
    }
  });

  it('symmetry: bond-order swap is detected regardless of direction', async () => {
    const fx = fixtures.find(f => f.id === 'fx-ethylene-dropped')!;
    // forward: gold = double, tactile = single → catches as already tested
    const forward = await verify(fx.goldIR, fx.tactileIR);
    // backward: gold = single, tactile = double → should also catch
    const backward = await verify(fx.tactileIR, fx.goldIR);
    expect(forward.pass).toBe(false);
    expect(backward.pass).toBe(false);
  });

  it('empty inputs do not crash', async () => {
    const empty = { smiles: '', atoms: [], bonds: [] };
    const report = await verify(empty, empty);
    // Empty SMILES is technically not parseable — fail cleanly, not crash.
    expect(report.pass).toBe(false);
    expect(report.diffs.length).toBeGreaterThan(0);
    expect(report.diffs[0].severity).toBe('error');
  });
});
