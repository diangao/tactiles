// Serverless NL → EditOp classifier (Build Day path 2).
//
// Runs server-side so ANTHROPIC_API_KEY never reaches the browser. Parallel to
// api/extract-smiles.ts (the image→SMILES parser) — same Vercel function shape,
// same shared key. A teacher types any phrasing ("the letters are too small",
// "make the double bonds clearer", "spread these apart") and Claude maps it to
// ONE safe rendering EditOp. The model only picks the op label + an optional
// scale factor; it never rewrites the IR or SVG. The client (edit-resolve.ts)
// re-validates and falls back to a deterministic regex router when this
// endpoint is unreachable, so the demo runs offline too.

declare const process: { env: Record<string, string | undefined> };

// Rendering-only ops (contracts.ts EditOp). Nothing structural — a mis-mapped
// command can change how the diagram looks, never what molecule it is.
const EDIT_KINDS = [
  "enlargeLabels",
  "thickenLines",
  "emphasizeDoubleBonds",
  "spaceLabels",
  "removeBackground",
  "export",
] as const;

const DEFAULT_MODEL = "claude-opus-4-8";
const MAX_INSTRUCTION_CHARS = 2_000;

type RequestBody = {
  instruction?: string;
  availableKinds?: string[];
};

const SYSTEM_PROMPT = [
  "You route a teacher's natural-language request into ONE editing operation for",
  "a tactile (braille) chemistry-diagram workbench. You do not edit the diagram",
  "yourself and you never change the chemistry — you only choose which rendering",
  "operation best matches the request, plus an optional scale factor.",
  "",
  "Operations:",
  "- enlargeLabels: make the atom labels / braille bigger (factor > 1, e.g. 1.4).",
  "- thickenLines: make the bond lines heavier/bolder (factor > 1).",
  "- emphasizeDoubleBonds: make double/triple bonds easier to feel apart.",
  "- spaceLabels: spread crowded labels further apart (factor > 1).",
  "- removeBackground: strip background detail / clutter so only the structure remains.",
  "- export: the user wants to download/print; set format to 'pdf' or 'svg'.",
  "- none: the request does not map to any operation above.",
  "",
  "Pick the single closest operation. Only include factor for enlargeLabels,",
  "thickenLines, or spaceLabels, and keep it between 0.5 and 3. If nothing fits,",
  "return kind 'none'.",
  "",
  "Respond with ONLY a single JSON object, no prose, no markdown, no code fence:",
  '{"kind": <one of ' +
    [...EDIT_KINDS, "none"].map((k) => `"${k}"`).join(", ") +
    ">, " +
    '"factor"?: <number 0.5-3>, "format"?: "svg"|"pdf", "reason": "<short reason>"}',
].join("\n");

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Use POST with { instruction }." });
    return;
  }

  // Credit-abuse guard: require a matching x-demo-key when a demo key is set.
  // Honors EXTRACT_SMILES_DEMO_KEY too, so the ONE key the team sets for the
  // parser proxy also protects this endpoint — otherwise a public deploy that
  // only sets EXTRACT_SMILES_DEMO_KEY would leave /api/edit-intent open to
  // anyone burning the ANTHROPIC API budget.
  const demoKey =
    process.env.EDIT_INTENT_DEMO_KEY ||
    process.env.DEMO_KEY ||
    process.env.EXTRACT_SMILES_DEMO_KEY;
  if (demoKey && headerValue(req, "x-demo-key") !== demoKey) {
    sendJson(res, 401, { error: "Missing or invalid demo key." });
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

  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!instruction) {
    sendJson(res, 400, { error: "Provide a non-empty instruction." });
    return;
  }
  if (instruction.length > MAX_INSTRUCTION_CHARS) {
    sendJson(res, 413, { error: "Instruction is too long." });
    return;
  }

  // Opus 4.8: NO temperature/top_p (removed → 400). Thinking omitted = off on
  // 4.7/4.8 — this is a trivial routing call, so we want it fast and cheap and
  // we force JSON-only output via the system prompt. We deliberately DON'T use
  // output_config/structured-outputs: the raw API rejects a `name` in
  // format and the prompt-JSON path (matching extract-smiles) is the proven
  // shape. parseModelJson (here) + toEditOp (client) re-validate defensively.
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

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
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: instruction }],
      }),
    });
  } catch {
    sendJson(res, 502, { error: "Could not reach the Anthropic API." });
    return;
  }

  const upstreamJson = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    sendJson(res, upstream.status, {
      error: "Anthropic classifier request failed.",
      status: upstream.status,
      detail: sanitizeUpstreamError(upstreamJson),
    });
    return;
  }

  const rawText = extractText(upstreamJson);
  const parsed = parseModelJson(rawText);
  const op = toEditOp(parsed);

  sendJson(res, 200, {
    op,
    reason: typeof parsed.reason === "string" ? parsed.reason : null,
    model,
  });
}

// ── EditOp coercion (server-side mirror of edit-resolve.toEditOp) ────────────
function toEditOp(parsed: Record<string, unknown>): Record<string, unknown> | null {
  const kind = parsed.kind;
  if (typeof kind !== "string" || kind === "none") return null;
  if (!(EDIT_KINDS as readonly string[]).includes(kind)) return null;

  if (kind === "export") {
    return { kind: "export", format: parsed.format === "pdf" ? "pdf" : "svg" };
  }
  if (kind === "enlargeLabels" || kind === "thickenLines" || kind === "spaceLabels") {
    if (typeof parsed.factor === "number" && Number.isFinite(parsed.factor)) {
      return { kind, factor: Math.max(0.5, Math.min(3, parsed.factor)) };
    }
    return { kind };
  }
  return { kind };
}

// ── Helpers (shape matches api/extract-smiles.ts) ────────────────────────────
function headerValue(req: any, name: string): string | undefined {
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

// Structured output should already be valid JSON; parse defensively anyway so a
// stray code-fence or prose wrapper can't 500 the endpoint.
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
