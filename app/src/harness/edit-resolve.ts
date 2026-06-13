// Real free-text → EditOp resolution (Build Day path 2: "盲文 diagram editable
// with natural language").
//
// edit-intent.ts is the DETERMINISTIC regex router — fast, offline, zero-cost,
// but only matches phrasings someone thought to encode. This layer puts a real
// Claude call in front of it so ANY phrasing maps to one safe EditOp, and the
// regex stays as the guaranteed floor when there's no key / no network.
//
// Safety invariant (matches contracts.ts): the model only picks the op *label*
// and an optional scale factor. It never rewrites the IR or the SVG — the
// deterministic edit() node applies the op, and the fidelity verifier gates the
// result. The op set here is RENDERING-only (size / weight / spacing / export);
// nothing structural, so a mis-mapped command can't corrupt the chemistry.

import type { EditOp, EditOpKind } from "./contracts";
import { EDIT_OP_KINDS } from "./contracts";
import { parseEditCommand } from "./edit-intent";

export type EditSource = "llm" | "fallback" | "none";

export type EditResolution = {
  op: EditOp | null;
  source: EditSource; // llm = model mapped it; fallback = regex floor; none = no match
  reason?: string; // human-readable, for the UI chip ("enlarge labels ×1.5")
  model?: string; // which model resolved it (source === "llm" only)
};

export type ResolveOptions = {
  // Serverless classifier endpoint (parallel to /api/extract-smiles). When unset
  // or unreachable we fall back to the deterministic regex router — the demo
  // never hard-depends on a live model call.
  endpoint?: string | null; // default "/api/edit-intent"; pass null to force local
  demoKey?: string | null; // x-demo-key header for the credit-abuse guard
  signal?: AbortSignal; // caller cancellation (e.g. user typed again)
  timeoutMs?: number; // default 8000
  localOnly?: boolean; // skip the network entirely (offline demo / tests)
  fetchImpl?: typeof fetch; // injectable for tests
};

const DEFAULT_ENDPOINT = "/api/edit-intent";
const DEFAULT_TIMEOUT_MS = 8000;
const MIN_FACTOR = 0.5;
const MAX_FACTOR = 3;

// Clamp a model-suggested scale factor so a hallucinated 50× can't blow up the
// render. Rendering ops only — never structural.
function clampFactor(f: number): number {
  return Math.max(MIN_FACTOR, Math.min(MAX_FACTOR, f));
}

// Coerce an arbitrary {kind, factor, format} payload into a valid EditOp.
// The endpoint already constrains output via json_schema, but we re-validate
// client-side so a malformed or out-of-date response can never inject a bad op.
export function toEditOp(raw: unknown): EditOp | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kind = r.kind;
  if (typeof kind !== "string" || kind === "none") return null;
  if (!(EDIT_OP_KINDS as readonly string[]).includes(kind)) return null;
  const k = kind as EditOpKind;

  switch (k) {
    case "export":
      return { kind: "export", format: r.format === "pdf" ? "pdf" : "svg" };
    case "enlargeLabels":
    case "thickenLines":
    case "spaceLabels": {
      if (typeof r.factor === "number" && Number.isFinite(r.factor)) {
        return { kind: k, factor: clampFactor(r.factor) };
      }
      return { kind: k };
    }
    case "emphasizeDoubleBonds":
    case "removeBackground":
      return { kind: k };
  }
}

// Human-readable summary for the UI (preflight chip / edit log).
export function describeOp(op: EditOp): string {
  switch (op.kind) {
    case "enlargeLabels":
      return op.factor ? `enlarge labels ×${op.factor}` : "enlarge labels";
    case "thickenLines":
      return op.factor ? `thicken lines ×${op.factor}` : "thicken bond lines";
    case "emphasizeDoubleBonds":
      return "emphasize double bonds";
    case "spaceLabels":
      return op.factor ? `space labels ×${op.factor}` : "space out labels";
    case "removeBackground":
      return "remove background detail";
    case "export":
      return `export ${op.format.toUpperCase()}`;
  }
}

function fallback(text: string): EditResolution {
  const op = parseEditCommand(text);
  return op
    ? { op, source: "fallback", reason: describeOp(op) }
    : { op: null, source: "none" };
}

/**
 * Map a free-text instruction to one safe EditOp.
 *
 * Tries the Claude-backed classifier endpoint first (real NL understanding,
 * can extract a scale factor); on no-key / network error / timeout / "none"
 * verdict it falls back to the deterministic regex router. Always resolves —
 * never throws — so a live demo degrades gracefully instead of breaking.
 */
export async function resolveEditCommand(
  text: string,
  opts: ResolveOptions = {},
): Promise<EditResolution> {
  const trimmed = text.trim();
  if (!trimmed) return { op: null, source: "none" };

  if (opts.localOnly) return fallback(trimmed);

  const endpoint = opts.endpoint === undefined ? DEFAULT_ENDPOINT : opts.endpoint;
  if (!endpoint) return fallback(trimmed);

  const doFetch =
    opts.fetchImpl ?? (typeof fetch !== "undefined" ? fetch : undefined);
  if (!doFetch) return fallback(trimmed);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort();
    else opts.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  }

  try {
    const resp = await doFetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(opts.demoKey ? { "x-demo-key": opts.demoKey } : {}),
      },
      body: JSON.stringify({ instruction: trimmed, availableKinds: EDIT_OP_KINDS }),
      signal: ctrl.signal,
    });
    if (!resp.ok) return fallback(trimmed);

    const data = (await resp.json()) as {
      op?: unknown;
      reason?: unknown;
      model?: unknown;
    };
    const op = toEditOp(data.op);
    if (!op) {
      // Model declined or returned garbage → try the regex floor before giving up.
      const fb = fallback(trimmed);
      if (fb.op) return fb;
      return {
        op: null,
        source: "none",
        reason: typeof data.reason === "string" ? data.reason : undefined,
      };
    }
    return {
      op,
      source: "llm",
      reason: typeof data.reason === "string" ? data.reason : describeOp(op),
      model: typeof data.model === "string" ? data.model : undefined,
    };
  } catch {
    // Abort / network error / no key on server → deterministic floor.
    return fallback(trimmed);
  } finally {
    clearTimeout(timer);
  }
}
