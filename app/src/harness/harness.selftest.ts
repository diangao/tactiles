// DX regression net: drive every fixture through the full mock pipeline
// (ingest → parse → compile → verify) and assert the deterministic verifier's
// verdict. Zero new deps — esbuild bundles it for node, run via `npm run
// selftest`. This catches a compile/verify regression before it reaches the
// workbench or the embosser.

import { mockNodes } from "./mock";
import { CHEM_FIXTURES, getFixture } from "../fixtures/chem";
import type { UploadedFile } from "./contracts";
import { buildDraftTactile, routeSubject } from "./subject-router";

// node-only exit, declared so the file typechecks under the DOM-only lib set.
declare const process: { exit(code: number): never };

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (!cond) failures++;
  console.log(`${cond ? "ok  " : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

function fileFor(id: string): UploadedFile {
  return { name: id, mime: "image/svg+xml", dataUrl: "" };
}

async function run(): Promise<void> {
  for (const fx of CHEM_FIXTURES) {
    let asset = await mockNodes.ingest(fileFor(fx.id));
    const ir = await mockNodes.parse(asset);
    asset = { ...asset, goldIR: ir, ir, status: "parsed" };
    const tactile = await mockNodes.compile(ir);
    const report = mockNodes.verify(ir, tactile.ir);

    check(
      `${fx.id}: gold verifies clean`,
      report.pass,
      report.diffs.map((d) => d.kind).join(","),
    );
    check(
      `${fx.id}: compile emits one braille label per atom`,
      tactile.braille.length === ir.atoms.length,
    );
    check(
      `${fx.id}: print sheet is emboss-ready A4 with raised dots`,
      !!tactile.printSheet &&
        tactile.printSheet.includes('width="210mm"') &&
        tactile.printSheet.includes("<circle"),
    );
    // The emboss layer carries raised dots only — a hollow preview ring
    // (fill="none") would emboss as tactile noise on a real braille printer.
    check(
      `${fx.id}: print sheet has no hollow preview dots`,
      !!tactile.printSheet && !tactile.printSheet.includes('fill="none"'),
    );
  }

  // Engineered money-shot: enlarging labels on acetic acid drops the C=O double
  // bond; the deterministic verifier must flip the preflight gate and name it.
  const acetic = getFixture("acetic-acid")!;
  let asset = await mockNodes.ingest(fileFor(acetic.id));
  const ir = await mockNodes.parse(asset);
  asset = { ...asset, goldIR: ir, ir, status: "parsed" };
  const edited = await mockNodes.edit({ kind: "enlargeLabels" }, asset);
  check(
    "acetic-acid: enlargeLabels trips the preflight gate",
    edited.report?.pass === false,
  );
  check(
    "acetic-acid: regression is flagged as wrong_bond_order",
    !!edited.report?.diffs.some((d) => d.kind === "wrong_bond_order"),
    edited.report?.diffs.map((d) => d.detail).join("; "),
  );

  // Export must deliver the emboss-ready sheet bytes, not the workbench preview.
  const tactile = await mockNodes.compile(ir);
  const blob = await mockNodes.exportTactile(tactile, "svg");
  const bytes = await blob.text();
  check("export returns the emboss-ready print sheet", bytes === tactile.printSheet);

  // Non-chem uploads should not masquerade as chemistry. They route to draft
  // tactile graphics with a teacher-review status; verified correctness remains
  // chemistry-only until each subject has its own IR/verifier.
  const biologyUpload = await mockNodes.ingest(
    fileFor("biology-neuron-synapse.svg"),
  );
  const route = routeSubject(biologyUpload);
  const draft = buildDraftTactile(biologyUpload, route);
  check("biology upload routes outside chemistry", biologyUpload.kind === "biology");
  check("biology route is draft-only teacher review", route.kind === "biology");
  check(
    "biology draft emits tactile geometry",
    draft.svg.includes("<path") && draft.printSheet?.includes("<circle") === true,
  );

  const unknownUpload = await mockNodes.ingest(
    fileFor("history-industrial-revolution-timeline.svg"),
  );
  const unknownRoute = routeSubject(unknownUpload);
  const unknownDraft = buildDraftTactile(unknownUpload, unknownRoute);
  check("unknown SVG route stays out of chemistry", unknownRoute.kind === "unknown");
  check(
    "unknown SVG route still emits teacher-review tactile draft",
    unknownDraft.draftKind === "unknown" &&
      unknownDraft.svg.includes("<path") &&
      unknownDraft.printSheet?.includes("<circle") === true,
  );

  console.log(
    `\n${failures === 0 ? "PASS" : "FAIL"} — ${CHEM_FIXTURES.length} fixtures, ${failures} failure(s)`,
  );
  if (failures > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
