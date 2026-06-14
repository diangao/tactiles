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

function imageAsset(name: string): DiagramAsset {
  return {
    id: "upload",
    name,
    kind: "unknown",
    createdAt: new Date(0).toISOString(),
    source: {
      name,
      mime: "image/png",
      dataUrl: "data:image/png;base64,AAAA",
    },
    status: "uploaded",
  };
}

function pdfAsset(name: string): DiagramAsset {
  return {
    id: "upload",
    name,
    kind: "unknown",
    createdAt: new Date(0).toISOString(),
    source: {
      name,
      mime: "application/pdf",
      dataUrl: "data:application/pdf;base64,AAAA",
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

  it("does not print routed subject labels in fallback drafts", () => {
    const upload = pdfAsset("biology-plant-cell-labeled.pdf");
    const route = routeSubject(upload);
    const tactile = buildDraftTactile(upload, route);
    const oldSubjectSubtitle = ["Biology", "diagram"].join(" ");

    expect(route.kind).toBe("biology");
    expect(tactile.svg).toContain("teacher review draft");
    expect(tactile.svg).not.toContain(oldSubjectSubtitle);
    expect(tactile.svg).not.toContain("biology");
    expect(tactile.printSheet).not.toContain(oldSubjectSubtitle);
    expect(tactile.printSheet).not.toContain("biology");
  });

  it("preserves an uploaded SVG even when no text labels are extractable", () => {
    const source = `
      <svg viewBox="0 0 200 120">
        <path d="M20 60 C40 10 160 10 180 60 C160 110 40 110 20 60Z" />
        <text>nucleus without coordinates</text>
      </svg>
    `;
    const upload = asset("biology-plant-cell-structure.svg", source);
    const route = routeSubject(upload);
    const tactile = buildDraftTactile(upload, route);

    expect(tactile.draftKind).toBe("biology");
    expect(tactile.svg).toContain("<image ");
    expect(tactile.svg).toContain("nucleus%20without%20coordinates");
    expect(tactile.svg).not.toContain("major lines");
    expect(tactile.printSheet).toContain("<image ");
    expect(tactile.printSheet).toContain('width="210mm"');
  });

  it("wraps raster image uploads in the tactile SVG instead of the placeholder", () => {
    const upload = imageAsset("biology-plant-cell-structure.png");
    const route = routeSubject(upload);
    const tactile = buildDraftTactile(upload, route);

    expect(tactile.draftKind).toBe("biology");
    expect(tactile.svg).toContain('<image href="data:image/png;base64,AAAA"');
    expect(tactile.svg).not.toContain("major lines");
    expect(tactile.printSheet).toContain('<image href="data:image/png;base64,AAAA"');
    expect(tactile.printSheet).toContain('width="210mm"');
  });

  it("uses extracted raster labels when the image-label translator returns them", () => {
    const upload = imageAsset("biology-plant-cell-structure.png");
    const route = routeSubject(upload);
    const tactile = buildDraftTactile(upload, route, {
      subject: "biology",
      title: "Plant cell",
      labels: [{ text: "nucleus", x: 0.5, y: 0.45, fontSize: 0.05 }],
    });

    expect(tactile.svg).toContain("Plant cell");
    expect(tactile.svg).toContain('<image href="data:image/png;base64,AAAA"');
    expect(tactile.svg).toContain("<rect ");
    expect(tactile.svg).toContain("<circle ");
    expect(tactile.braille.map((label) => label.cells)).toEqual(["⠝⠥⠉⠇⠑⠥⠎"]);
  });
});
