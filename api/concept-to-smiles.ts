// Serverless concept → SMILES generator (Build Day path 3).
//
// Sibling of api/extract-smiles.ts (image→SMILES): same Vercel function shape,
// same shared key. A teacher types a chemistry concept by name ("aspirin",
// "benzene", "the amino acid glycine") and Claude returns the canonical SMILES
// for that molecule. The SMILES then flows through the SAME deterministic path
// as an upload — smilesToIR (rdkit 2D depiction) → braille compile → verifier —
// so a typed concept lands as a fully `verified` tactile sheet, not a draft.
//
// The model only emits a SMILES string + the resolved name; it never builds the
// diagram. rdkit owns the structure, the verifier owns fidelity.

declare const process: { env: Record<string, string | undefined> };

const DEFAULT_MODEL = "claude-opus-4-8";
const MAX_CONCEPT_CHARS = 400;

type RequestBody = {
  concept?: string;
  context?: string;
};

const SYSTEM_PROMPT = [
  "You convert a chemistry concept named in natural language into the single",
  "molecule that best represents it, for an accessibility tool that renders",
  "tactile (braille) chemical structures for blind students.",
  "",
  "Given a concept (a compound name, formula, or short description), return the",
  "canonical SMILES of the one molecule a teacher most likely means.",
  "",
  "Rules:",
  "- Return ONE neutral, most-common form (e.g. aspirin -> CC(=O)Oc1ccccc1C(=O)O).",
  "- If the concept is not a single concrete molecule (an element, a reaction, a",
  "  whole class like 'alcohols', an abstract idea), set smiles to null and say",
  "  why in warnings.",
  "- Do not invent a structure you are unsure of; lower confidence instead.",
  "- name is the common name of the molecule you chose.",
  "",
  "Respond with ONLY a single JSON object, no prose, no markdown, no code fence:",
  '{"smiles": string | null, "name": string | null, "confidence": "high" | "medium" | "low", "warnings": string[]}',
].join("\n");

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Use POST with { concept }." });
    return;
  }

  // Credit-abuse guard: require a matching x-demo-key when one is set. Honors
  // EXTRACT_SMILES_DEMO_KEY too, so the ONE key the team sets for the parser
  // proxy also protects this sibling endpoint (mirrors api/edit-intent.ts).
  const demoKey =
    process.env.CONCEPT_TO_SMILES_DEMO_KEY ||
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

  const concept = typeof body.concept === "string" ? body.concept.trim() : "";
  if (!concept) {
    sendJson(res, 400, { error: "Provide a non-empty concept." });
    return;
  }
  if (concept.length > MAX_CONCEPT_CHARS) {
    sendJson(res, 413, { error: "Concept is too long." });
    return;
  }

  // Opus 4.8: NO temperature/top_p (removed -> 400). Prompt-JSON output (not
  // output_config) to match extract-smiles/edit-intent; parseModelJson
  // re-validates defensively so a stray fence can't 500 the endpoint.
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const userText = body.context ? `${concept}\n\nContext: ${body.context}` : concept;

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
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userText }],
      }),
    });
  } catch {
    sendJson(res, 502, { error: "Could not reach the Anthropic API." });
    return;
  }

  const upstreamJson = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    sendJson(res, upstream.status, {
      error: "Anthropic concept request failed.",
      status: upstream.status,
      detail: sanitizeUpstreamError(upstreamJson),
    });
    return;
  }

  const rawText = extractText(upstreamJson);
  const parsed = parseModelJson(rawText);

  sendJson(res, 200, {
    smiles: typeof parsed.smiles === "string" ? parsed.smiles : null,
    name: typeof parsed.name === "string" ? parsed.name : null,
    confidence: normalizeConfidence(parsed.confidence),
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
    model,
  });
}

// ── Helpers (shape matches api/extract-smiles.ts + api/edit-intent.ts) ────────
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

function normalizeConfidence(value: unknown): "high" | "medium" | "low" {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
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
