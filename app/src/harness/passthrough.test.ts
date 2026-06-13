import { describe, it, expect } from "vitest";
import {
  compositeTactileSheet,
  extractTactileLabels,
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
});
