import { describe, expect, it } from "vitest";
import type { DiagramAsset } from "./contracts";
import { buildDraftTactile, routeSubject } from "./subject-router";

function asset(name: string, source = "<svg/>"): DiagramAsset {
  return {
    id: "upload",
    name,
    kind: "unknown",
    createdAt: new Date(0).toISOString(),
    source: {
      name,
      mime: "image/svg+xml",
      dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(source)}`,
    },
    status: "uploaded",
  };
}

describe("routeSubject", () => {
  it("does not classify labeled biology diagrams as LED circuits", () => {
    const route = routeSubject(asset("biology-plant-cell-labeled.svg"));
    expect(route.kind).toBe("biology");
    expect(route.reason).toContain('"biology"');
  });

  it("still recognizes standalone LED circuit filenames", () => {
    expect(routeSubject(asset("led-circuit.svg")).kind).toBe("circuit");
  });
});

describe("buildDraftTactile", () => {
  it("keeps subject hints internal and emits a print .brf label source", () => {
    const source = `
      <svg viewBox="0 0 200 120">
        <rect x="30" y="20" width="140" height="80" />
        <text x="100" y="40" font-size="14">nucleus</text>
      </svg>
    `;
    const upload = asset("biology-plant-cell-labeled.svg", source);
    const route = routeSubject(upload);
    const tactile = buildDraftTactile(upload, route);

    expect(tactile.draftKind).toBe("biology");
    expect(tactile.svg).toContain("Tactile draft");
    expect(tactile.svg).not.toContain("Biology tactile draft");
    expect(tactile.svg).not.toContain("Circuit tactile draft");
    expect(tactile.printSheet).toContain('width="210mm"');
    expect(tactile.braille.map((label) => label.cells)).toContain("⠝⠥⠉⠇⠑⠥⠎");
  });
});
