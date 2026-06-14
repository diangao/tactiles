import { describe, it, expect } from "vitest";
import {
  compositeTactileSheet,
  extractTactileLabels,
  extractTactileLabelsFromSVG,
  type TactileLabelExtraction,
} from "./passthrough";

const sourceSVG: { name: string; mime: "image/svg+xml"; dataUrl: string } = {
  name: "physics-incline.svg",
  mime: "image/svg+xml",
  dataUrl: "data:image/svg+xml;utf8," + encodeURIComponent("<svg/>"),
};

function stubFetch(payload: unknown, ok = true): typeof fetch {
  return (async () =>
    ({
      ok,
      status: ok ? 200 : 502,
      json: async () => payload,
    }) as unknown as Response) as unknown as typeof fetch;
}

describe("extractTactileLabels — coerce & validate", () => {
  it("coerces a clean model response", async () => {
    const out = await extractTactileLabels(sourceSVG, {
      fetchImpl: stubFetch({
        subject: "physics",
        title: "Incline forces",
        labels: [
          { text: "N", x: 0.4, y: 0.3, fontSize: 0.05 },
          { text: "mg", x: 0.5, y: 0.7, fontSize: 0.05 },
        ],
      }),
    });
    expect(out.subject).toBe("physics");
    expect(out.title).toBe("Incline forces");
    expect(out.labels).toHaveLength(2);
    expect(out.labels[0].text).toBe("N");
  });

  it("clamps out-of-range positions and font sizes", async () => {
    const out = await extractTactileLabels(sourceSVG, {
      fetchImpl: stubFetch({
        subject: "biology",
        title: "",
        labels: [{ text: "axon", x: 1.7, y: -0.4, fontSize: 99 }],
      }),
    });
    expect(out.labels[0].x).toBe(1);
    expect(out.labels[0].y).toBe(0);
    expect(out.labels[0].fontSize).toBeLessThanOrEqual(0.2);
  });

  it("drops labels with no text or non-finite coords", async () => {
    const out = await extractTactileLabels(sourceSVG, {
      fetchImpl: stubFetch({
        subject: "math",
        title: "",
        labels: [
          { text: "", x: 0.1, y: 0.1 },
          { text: "x", x: "abc", y: 0.2 },
          { text: "y", x: 0.3, y: 0.4, fontSize: 0.05 },
        ],
      }),
    });
    expect(out.labels.map((l) => l.text)).toEqual(["y"]);
  });

  it("falls back to subject=other on unknown subjects", async () => {
    const out = await extractTactileLabels(sourceSVG, {
      fetchImpl: stubFetch({ subject: "art", title: "", labels: [] }),
    });
    expect(out.subject).toBe("other");
  });

  it("throws on non-2xx endpoint response", async () => {
    await expect(
      extractTactileLabels(sourceSVG, {
        fetchImpl: stubFetch({ error: "boom" }, false),
      }),
    ).rejects.toThrow(/passthrough/);
  });
});

describe("compositeTactileSheet — output structure", () => {
  const extraction: TactileLabelExtraction = {
    subject: "physics",
    title: "Incline forces",
    labels: [
      { text: "N", x: 0.4, y: 0.3, fontSize: 0.04 },
      { text: "mg", x: 0.55, y: 0.7, fontSize: 0.04 },
    ],
  };

  it("embeds the source image and overlays braille", () => {
    const png = {
      name: "x.png",
      mime: "image/png" as const,
      dataUrl: "data:image/png;base64,AAAA",
    };
    const svg = compositeTactileSheet(png, extraction);
    expect(svg).toMatch(/<svg /);
    // Source embedded as <image href=...>
    expect(svg).toMatch(/<image href="data:image\/png;base64,AAAA"/);
    // Knockout rect per label
    const rectCount = (svg.match(/<rect /g) ?? []).length;
    // 1 background + 2 per-label knockouts
    expect(rectCount).toBeGreaterThanOrEqual(3);
    // Each label produces some braille circles
    expect(svg).toMatch(/<circle /);
    // Title rendered as both printed text and braille overlay
    expect(svg).toMatch(/Incline forces/);
  });

  it("escapes XML in the source href and label text", () => {
    const trickyTitle: TactileLabelExtraction = {
      ...extraction,
      title: "<script>alert('x')</script>",
    };
    const png = {
      name: "x.png",
      mime: "image/png" as const,
      dataUrl: "data:image/png;base64,AAA<bad>",
    };
    const svg = compositeTactileSheet(png, trickyTitle);
    expect(svg).not.toMatch(/<script>alert/);
    expect(svg).toMatch(/&lt;script&gt;/);
    expect(svg).not.toMatch(/AAA<bad>/);
    expect(svg).toMatch(/AAA&lt;bad&gt;/);
  });

  it("handles an empty labels list cleanly (still embeds source)", () => {
    const png = {
      name: "x.png",
      mime: "image/png" as const,
      dataUrl: "data:image/png;base64,QQQ",
    };
    const svg = compositeTactileSheet(png, {
      subject: "other",
      title: "",
      labels: [],
    });
    expect(svg).toMatch(/<image href="data:image\/png;base64,QQQ"/);
    // No braille overlays (other than possible title-derived ones)
    expect((svg.match(/<rect /g) ?? []).length).toBe(1); // just the background
  });

  it("fits SVG sources into A4 without stretching their source aspect ratio", () => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
      <rect x="0" y="0" width="200" height="100"/>
      <text x="100" y="50">center</text>
    </svg>`;
    const svg = compositeTactileSheet(
      {
        name: "wide.svg",
        mime: "image/svg+xml" as const,
        dataUrl: "data:image/svg+xml;utf8," + encodeURIComponent(source),
      },
      {
        subject: "biology",
        title: "Wide source",
        labels: [{ text: "center", x: 0.5, y: 0.5, fontSize: 0.05 }],
      },
      { width: 210, height: 297 },
    );

    expect(svg).toContain('width="210mm"');
    expect(svg).toMatch(/<image [^>]*x="0\.0" y="113\.0" width="210\.0" height="105\.0"/);
    expect(svg).not.toMatch(/<image [^>]*y="44" width="210" height="243"/);
  });
});

describe("extractTactileLabelsFromSVG — deterministic SVG fast path", () => {
  it("reads <text> elements with x/y/font-size and normalizes by viewBox", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
      <line x1="0" y1="0" x2="100" y2="100" stroke="black"/>
      <text x="40" y="20" font-size="10">axon</text>
      <text x="160" y="80" font-size="14">synapse</text>
    </svg>`;
    const out = extractTactileLabelsFromSVG(svg, "biology", "Neuron");
    expect(out.subject).toBe("biology");
    expect(out.title).toBe("Neuron");
    expect(out.labels).toHaveLength(2);
    expect(out.labels[0]).toEqual({ text: "axon", x: 0.2, y: 0.2, fontSize: 0.1 });
    expect(out.labels[1].text).toBe("synapse");
    expect(out.labels[1].x).toBeCloseTo(0.8);
    expect(out.labels[1].y).toBeCloseTo(0.8);
  });

  it("falls back to width/height when viewBox is missing", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">
      <text x="100" y="50" font-size="12">midpoint</text>
    </svg>`;
    const out = extractTactileLabelsFromSVG(svg);
    expect(out.labels).toHaveLength(1);
    expect(out.labels[0].x).toBe(0.25);
    expect(out.labels[0].y).toBe(0.25);
  });

  it("flattens tspan children and decodes entities in label text", () => {
    const svg = `<svg viewBox="0 0 100 100">
      <text x="10" y="10"><tspan>line one</tspan> &amp; <tspan>two</tspan></text>
    </svg>`;
    const out = extractTactileLabelsFromSVG(svg);
    expect(out.labels[0].text).toBe("line one & two");
  });

  it("returns no labels when the SVG has no resolvable viewport", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="10">x</text></svg>`;
    const out = extractTactileLabelsFromSVG(svg);
    expect(out.labels).toEqual([]);
  });

  it("ignores <text> elements without x or y", () => {
    const svg = `<svg viewBox="0 0 100 100"><text>no coords</text><text x="5" y="5">ok</text></svg>`;
    const out = extractTactileLabelsFromSVG(svg);
    expect(out.labels.map((l) => l.text)).toEqual(["ok"]);
  });

  it("clamps coordinates outside the viewport rather than dropping them", () => {
    const svg = `<svg viewBox="0 0 100 100"><text x="150" y="-20" font-size="10">edge</text></svg>`;
    const out = extractTactileLabelsFromSVG(svg);
    expect(out.labels[0].x).toBe(1);
    expect(out.labels[0].y).toBe(0);
  });
});
