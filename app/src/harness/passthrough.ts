// Passthrough tactile renderer for non-chemistry STEM diagrams.
//
// Product principle: the source diagram's lines / arrows / shapes
// are already tactile-printable — print them on swell paper and the black ink
// puffs into raised lines. The only thing we need to add is braille labels
// where the printed text labels are. No subject-specific IR, no verifier,
// no semantic rewrite — pure visual passthrough with a label substitution.
//
// Pipeline:
//   1. /api/extract-tactile-labels takes the uploaded image/SVG and returns
//      { subject, title, labels: [{ text, x, y, fontSize }] } in normalized
//      (0..1) image coordinates.
//   2. compositeTactileSheet wraps the source as an <image> in a fresh SVG,
//      knocks out each label's bounding box, and overlays braille glyphs at
//      the same position using the existing PRINT_BRAILLE_MM geometry.
//
// Output is a single self-contained SVG — same shape the chemistry compile
// produces — so the existing export / print pane works unchanged.

import type { UploadedFile } from "./contracts";
import { brailleLabelSVG, brailleLabelWidth, PRINT_BRAILLE_MM } from "./braille-render";

export type TactileSubject =
  | "chemistry"
  | "biology"
  | "physics"
  | "math"
  | "geography"
  | "other";

export type TactileLabel = {
  text: string;
  x: number; // 0..1, normalized center x
  y: number; // 0..1, normalized center y
  fontSize: number; // 0..1, normalized line height
};

export type TactileLabelExtraction = {
  subject: TactileSubject;
  title: string;
  labels: TactileLabel[];
};

export type ExtractOptions = {
  endpoint?: string;
  demoKey?: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

const DEFAULT_ENDPOINT = "/api/extract-tactile-labels";
const DEFAULT_TIMEOUT_MS = 30_000;

// Render canvas for the composite output. Coordinates from the endpoint are
// normalized 0..1 so they map cleanly regardless of source resolution.
const CANVAS_W = 1024;
const CANVAS_H = 768;

/**
 * Call the serverless tactile-label extractor for an uploaded file.
 */
export async function extractTactileLabels(
  file: UploadedFile,
  opts: ExtractOptions = {},
): Promise<TactileLabelExtraction> {
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  const doFetch = opts.fetchImpl ?? (typeof fetch !== "undefined" ? fetch : undefined);
  if (!doFetch) {
    throw new Error("passthrough: no fetch available in this environment.");
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort();
    else opts.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  }

  const body =
    file.mime === "image/svg+xml"
      ? { svgText: dataUrlToText(file.dataUrl), fileName: file.name }
      : { imageDataUrl: file.dataUrl, mediaType: file.mime, fileName: file.name };

  try {
    const resp = await doFetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(opts.demoKey ? { "x-demo-key": opts.demoKey } : {}),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(`passthrough: extractor failed (${resp.status}) — ${err.error ?? "unknown"}`);
    }
    const data = (await resp.json()) as unknown;
    return coerceExtraction(data);
  } finally {
    clearTimeout(timer);
  }
}

function coerceExtraction(data: unknown): TactileLabelExtraction {
  if (!data || typeof data !== "object") {
    return { subject: "other", title: "", labels: [] };
  }
  const d = data as Record<string, unknown>;
  const subject = isSubject(d.subject) ? d.subject : "other";
  const title = typeof d.title === "string" ? d.title : "";
  const labels: TactileLabel[] = [];
  const raw = Array.isArray(d.labels) ? d.labels : [];
  for (const l of raw) {
    if (!l || typeof l !== "object") continue;
    const r = l as Record<string, unknown>;
    const text = typeof r.text === "string" ? r.text.trim() : "";
    const x = clamp01(numOrNaN(r.x));
    const y = clamp01(numOrNaN(r.y));
    const fontSize = clamp(numOrNaN(r.fontSize), 0.01, 0.2);
    if (!text || Number.isNaN(x) || Number.isNaN(y)) continue;
    labels.push({ text, x, y, fontSize: Number.isFinite(fontSize) ? fontSize : 0.04 });
  }
  return { subject, title, labels };
}

function isSubject(v: unknown): v is TactileSubject {
  return (
    v === "chemistry" ||
    v === "biology" ||
    v === "physics" ||
    v === "math" ||
    v === "geography" ||
    v === "other"
  );
}

function numOrNaN(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : NaN;
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return n;
  return n < lo ? lo : n > hi ? hi : n;
}

function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function dataUrlToText(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return dataUrl;
  const data = dataUrl.slice(comma + 1);
  // SVG sources are read in the browser, so atob covers the only real callsite.
  return dataUrl.slice(0, comma).includes(";base64")
    ? atob(data)
    : decodeURIComponent(data);
}

// Style scale for braille glyphs in the composite. PRINT_BRAILLE_MM is sized
// for mm units on the print sheet; this is pixel-scale, so we shrink to ~16px
// cell width which reads clearly at the canvas size.
const PIXEL_BRAILLE = {
  dotPitch: PRINT_BRAILLE_MM.dotPitch * 6,
  cellAdvance: PRINT_BRAILLE_MM.cellAdvance * 6,
  dotRadius: PRINT_BRAILLE_MM.dotRadius * 6,
  showFlat: false,
  raisedFill: "#000",
  flatStroke: "#bbb",
};

/**
 * Compose a tactile SVG from the original source + the detected text labels.
 *
 * The source is embedded as an <image> so its line geometry passes through
 * untouched (those raised lines are what swell paper / a tactile-graphics
 * embosser actually prints). Each detected label is given a white knockout
 * box at its position to hide the printed text, then a braille rendering of
 * the same text overlaid at that position. The braille glyph is centered on
 * (x, y) — the same point the model returned for the printed label.
 */
export function compositeTactileSheet(
  source: UploadedFile,
  extraction: TactileLabelExtraction,
  canvas: { width: number; height: number } = { width: CANVAS_W, height: CANVAS_H },
): string {
  const W = canvas.width;
  const H = canvas.height;
  const href = source.dataUrl;

  const knockouts = extraction.labels
    .map((l) => {
      // Conservative knockout: a rectangle slightly larger than the braille
      // overlay, so printed glyph residue under the braille doesn't read as
      // tactile noise after embossing.
      const px = l.x * W;
      const py = l.y * H;
      const w = brailleLabelWidth(l.text, PIXEL_BRAILLE) + 16;
      const h = l.fontSize * H * 1.6 + 8;
      return `<rect x="${(px - w / 2).toFixed(1)}" y="${(py - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="#fff"/>`;
    })
    .join("");

  const brailleGlyphs = extraction.labels
    .map((l) => {
      const px = l.x * W;
      const py = l.y * H;
      const w = brailleLabelWidth(l.text, PIXEL_BRAILLE);
      // Center the braille rendering on (px, py). brailleLabelSVG places the
      // top-left dot at (x, y); subtract half-width and half a row-height.
      const x = px - w / 2;
      const y = py - PIXEL_BRAILLE.dotPitch;
      return brailleLabelSVG(l.text, x, y, PIXEL_BRAILLE);
    })
    .join("");

  const titleHeader = extraction.title
    ? `<text x="${W / 2}" y="${22}" font-size="14" font-family="monospace" font-weight="700" fill="#000" text-anchor="middle">${escapeXml(extraction.title)}</text>` +
      brailleLabelSVG(
        extraction.title,
        W / 2 - brailleLabelWidth(extraction.title, PIXEL_BRAILLE) / 2,
        40,
        PIXEL_BRAILLE,
      )
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="tactile passthrough sheet"><rect width="100%" height="100%" fill="#fff"/>` +
    `<image href="${escapeXml(href)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet"/>` +
    knockouts +
    brailleGlyphs +
    titleHeader +
    `</svg>`
  );
}
