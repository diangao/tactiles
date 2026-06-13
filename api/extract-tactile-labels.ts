// Serverless tactile-label extractor: any STEM diagram → its text labels,
// positioned, plus a guess at the subject.
//
// This is the parser for the PASSTHROUGH lane (everything that isn't
// chemistry's typed IR + verifier story). The output is intentionally generic:
// the source image's lines / shapes / arrows are already tactile-printable on
// swell paper, and the client just needs to know where each text label sits so
// it can paint over those positions with braille glyphs at the same location.
//
// Returns subject so the client can decide whether to route this through the
// chemistry pipeline (the safe, verified one) or the generic passthrough.

declare const process: { env: Record<string, string | undefined> };

const MAX_BASE64_CHARS = 6_000_000;
const MAX_SVG_CHARS = 250_000;
const MAX_LABELS = 80;
const DEFAULT_MODEL = "claude-opus-4-8";
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

type RequestBody = {
  imageDataUrl?: string;
  imageBase64?: string;
  mediaType?: string;
  svgText?: string;
  fileName?: string;
};

type ImageInput = { mediaType: string; data: string };

const ALLOWED_SUBJECTS = [
  "chemistry",
  "biology",
  "physics",
  "math",
  "geography",
  "other",
] as const;

const SYSTEM_PROMPT = [
  "You are looking at a STEM teaching diagram. The downstream system",
  "will emboss the diagram on swell paper so a blind student can feel it,",
  "and overlay the text labels in braille at the same positions.",
  "",
  "Your job: return a short JSON object listing every text label in the",
  "diagram with its position (centered in normalized image coordinates,",
  "x and y both in 0..1), the visual font size as a fraction of image",
  "height (0..1), and the rendered text itself. Also classify the",
  "subject: chemistry | biology | physics | math | geography | other.",
  "",
  "RULES:",
  "- Include EVERY text label visible in the diagram, including axis",
  "  labels, axis ticks, callouts, captions, legends.",
  "- Exclude page headers / titles that are above the diagram.",
  "- Coordinates are the CENTER of the label, normalized 0..1.",
  "- Skip mathematical symbols that aren't text (arrows, equals signs,",
  "  punctuation drawn as part of the geometry).",
  "- If the diagram is clearly a chemistry molecular structure (atoms,",
  "  bonds, skeletal formula), set subject = 'chemistry'. Otherwise pick",
  "  the closest other category.",
  "",
  "Respond with ONLY a single JSON object, no prose, no markdown, no",
  "code fence:",
  '{"subject": "<one of the above>", "title": "<short caption or empty string>",',
  ' "labels": [{"text": "<string>", "x": <0..1>, "y": <0..1>, "fontSize": <0..1>}]}',
].join("\n");

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Use POST with a diagram image or svgText." });
    return;
  }

  // Share the same demo-key gate as extract-smiles so one env var protects
  // both endpoints from drive-by quota burn.
  const demoKey = process.env.EXTRACT_SMILES_DEMO_KEY || process.env.TACTILE_LABELS_DEMO_KEY;
  if (demoKey && getHeader(req, "x-demo-key") !== demoKey) {
    sendJson(res, 401, { error: "Unauthorized tactile-labels request." });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    sendJson(res, 500, { error: "ANTHROPIC_API_KEY is not configured on the server." });
    return;
  }

  let body: RequestBody;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: "Request body must be valid JSON." });
    return;
  }

  const image = parseImageInput(body);
  const svgText = typeof body.svgText === "string" ? body.svgText.trim() : "";
  if (!image && !svgText) {
    sendJson(res, 400, { error: "Provide imageDataUrl, imageBase64 + mediaType, or svgText." });
    return;
  }
  if (image && image.data.length > MAX_BASE64_CHARS) {
    sendJson(res, 413, { error: "Image payload is too large." });
    return;
  }
  if (svgText.length > MAX_SVG_CHARS) {
    sendJson(res, 413, { error: "SVG payload is too large." });
    return;
  }

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const content = buildContent(image, svgText);

  let upstream: Response;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      }),
    });
  } catch {
    sendJson(res, 502, { error: "Could not reach the Anthropic API." });
    return;
  }

  const upstreamJson = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    sendJson(res, upstream.status, {
      error: "Tactile-labels request failed.",
      status: upstream.status,
      detail: sanitizeUpstreamError(upstreamJson),
    });
    return;
  }

  const rawText = extractText(upstreamJson);
  const parsed = parseModelJson(rawText);
  const out = coerceResponse(parsed);

  sendJson(res, 200, { ...out, model });
}

// ── Response coercion ───────────────────────────────────────────────────────
function coerceResponse(parsed: Record<string, unknown>): {
  subject: (typeof ALLOWED_SUBJECTS)[number];
  title: string;
  labels: Array<{ text: string; x: number; y: number; fontSize: number }>;
} {
  const rawSubject = typeof parsed.subject === "string" ? parsed.subject : "";
  const subject = (ALLOWED_SUBJECTS as readonly string[]).includes(rawSubject)
    ? (rawSubject as (typeof ALLOWED_SUBJECTS)[number])
    : "other";
  const title = typeof parsed.title === "string" ? parsed.title.slice(0, 200) : "";
  const labels: Array<{ text: string; x: number; y: number; fontSize: number }> = [];
  const rawLabels = Array.isArray(parsed.labels) ? parsed.labels : [];
  for (const l of rawLabels.slice(0, MAX_LABELS)) {
    if (!l || typeof l !== "object") continue;
    const rec = l as Record<string, unknown>;
    const text = typeof rec.text === "string" ? rec.text.trim().slice(0, 80) : "";
    const x = typeof rec.x === "number" ? clamp01(rec.x) : null;
    const y = typeof rec.y === "number" ? clamp01(rec.y) : null;
    const fontSize =
      typeof rec.fontSize === "number" ? clamp(rec.fontSize, 0.01, 0.2) : 0.04;
    if (!text || x === null || y === null) continue;
    labels.push({ text, x, y, fontSize });
  }
  return { subject, title, labels };
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

// ── VLM content payload ────────────────────────────────────────────────────
function buildContent(image: ImageInput | null, svgText: string): unknown[] {
  const blocks: unknown[] = [];
  if (image) {
    blocks.push({
      type: "image",
      source: { type: "base64", media_type: image.mediaType, data: image.data },
    });
  }
  if (svgText) {
    blocks.push({ type: "text", text: "<svg_source>\n" + svgText + "\n</svg_source>" });
  }
  blocks.push({
    type: "text",
    text: image
      ? "Return the JSON object for this diagram."
      : "Read the SVG source above and return the JSON object for the diagram it draws.",
  });
  return blocks;
}

// ── Helpers (shape mirrors api/extract-smiles.ts) ───────────────────────────
function parseImageInput(body: RequestBody): ImageInput | null {
  if (typeof body.imageDataUrl === "string" && body.imageDataUrl.startsWith("data:")) {
    const match = body.imageDataUrl.match(/^data:([^;,]+);base64,([\s\S]+)$/);
    if (match) {
      const mediaType = match[1];
      if (SUPPORTED_IMAGE_TYPES.has(mediaType)) {
        return { mediaType, data: match[2] };
      }
    }
  }
  if (
    typeof body.imageBase64 === "string" &&
    typeof body.mediaType === "string" &&
    SUPPORTED_IMAGE_TYPES.has(body.mediaType)
  ) {
    return { mediaType: body.mediaType, data: body.imageBase64 };
  }
  return null;
}

function getHeader(req: any, name: string): string | undefined {
  const h = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(h) ? h[0] : h;
}

async function readJsonBody(req: any): Promise<RequestBody> {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function extractText(json: any): string {
  if (!json || !Array.isArray(json.content)) return "";
  return json.content
    .filter((b: any) => b && b.type === "text" && typeof b.text === "string")
    .map((b: any) => b.text)
    .join("\n")
    .trim();
}

function parseModelJson(text: string): Record<string, unknown> {
  if (!text) return {};
  const direct = tryParse(text);
  if (direct) return direct;
  const match = text.match(/\{[\s\S]*\}/);
  return (match && tryParse(match[0])) || {};
}

function tryParse(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

function sanitizeUpstreamError(json: any): string {
  const msg = json?.error?.message;
  return typeof msg === "string" ? msg.slice(0, 200) : "unknown upstream error";
}

function sendJson(res: any, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type, x-demo-key");
  res.end(JSON.stringify(payload));
}
