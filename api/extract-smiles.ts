declare const process: { env: Record<string, string | undefined> };

const MAX_BASE64_CHARS = 6_000_000;
const MAX_SVG_CHARS = 250_000;
const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';

type RequestBody = {
  imageDataUrl?: string;
  imageBase64?: string;
  mediaType?: string;
  svgText?: string;
  fileName?: string;
  context?: string;
};

type ImageInput = {
  mediaType: string;
  data: string;
};

const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Use POST with a chemistry diagram image or SVG payload.' });
    return;
  }

  const demoKey = process.env.EXTRACT_SMILES_DEMO_KEY;
  if (demoKey && getHeader(req, 'x-demo-key') !== demoKey) {
    sendJson(res, 401, { error: 'Unauthorized parser request.' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    sendJson(res, 500, { error: 'ANTHROPIC_API_KEY is not configured on the server.' });
    return;
  }

  let body: RequestBody;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'Request body must be valid JSON.' });
    return;
  }

  const image = parseImageInput(body);
  const svgText = typeof body.svgText === 'string' ? body.svgText.trim() : '';

  if (!image && !svgText) {
    sendJson(res, 400, {
      error: 'Provide imageDataUrl, imageBase64 + mediaType, or svgText.',
    });
    return;
  }

  if (image && image.data.length > MAX_BASE64_CHARS) {
    sendJson(res, 413, { error: 'Image payload is too large for the parser endpoint.' });
    return;
  }

  if (svgText.length > MAX_SVG_CHARS) {
    sendJson(res, 413, { error: 'SVG payload is too large for the parser endpoint.' });
    return;
  }

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const prompt = buildPrompt(body, Boolean(image), Boolean(svgText));
  const content: any[] = [];

  if (image) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: image.mediaType,
        data: image.data,
      },
    });
  }

  content.push({
    type: 'text',
    text: svgText ? `${prompt}\n\nSVG input:\n${svgText}` : prompt,
  });

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      temperature: 0,
      system:
        'You are a chemistry OCR parser for an accessibility tool. Extract structure only; do not give chemistry advice.',
      messages: [
        {
          role: 'user',
          content,
        },
      ],
    }),
  });

  const upstreamJson = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    sendJson(res, upstream.status, {
      error: 'Anthropic parser request failed.',
      status: upstream.status,
      detail: sanitizeUpstreamError(upstreamJson),
    });
    return;
  }

  const rawText = extractText(upstreamJson);
  const parsed = parseModelJson(rawText);

  sendJson(res, 200, {
    smiles: typeof parsed.smiles === 'string' ? parsed.smiles : null,
    confidence: normalizeConfidence(parsed.confidence),
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
    model,
    rawText,
  });
}

async function readJsonBody(req: any): Promise<RequestBody> {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  if (typeof req.body === 'string') {
    return JSON.parse(req.body);
  }

  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
  }
  return raw ? JSON.parse(raw) : {};
}

function parseImageInput(body: RequestBody): ImageInput | null {
  if (typeof body.imageDataUrl === 'string') {
    const match = body.imageDataUrl.match(/^data:([^;,]+);base64,(.+)$/i);
    if (!match) {
      return null;
    }
    const mediaType = match[1].toLowerCase();
    if (!SUPPORTED_IMAGE_TYPES.has(mediaType)) {
      return null;
    }
    return { mediaType, data: compactBase64(match[2]) };
  }

  if (typeof body.imageBase64 === 'string' && typeof body.mediaType === 'string') {
    const mediaType = body.mediaType.toLowerCase();
    if (!SUPPORTED_IMAGE_TYPES.has(mediaType)) {
      return null;
    }
    return { mediaType, data: compactBase64(body.imageBase64) };
  }

  return null;
}

function getHeader(req: any, name: string): string | undefined {
  const value = req.headers?.[name.toLowerCase()] ?? req.headers?.[name];
  return Array.isArray(value) ? value[0] : typeof value === 'string' ? value : undefined;
}

function compactBase64(value: string): string {
  return value.replace(/\s/g, '');
}

function buildPrompt(body: RequestBody, hasImage: boolean, hasSvg: boolean): string {
  const sourceKind = hasSvg && !hasImage ? 'tactile SVG markup' : 'chemistry diagram image';
  const context = body.context ? `\nContext: ${body.context}` : '';
  const fileName = body.fileName ? `\nFile name: ${body.fileName}` : '';

  return `Extract the molecule represented in this ${sourceKind} for downstream structural verification.

Return JSON only with this exact schema:
{"smiles": string | null, "confidence": "high" | "medium" | "low", "warnings": string[]}

Rules:
- Preserve atom identity and bond order.
- If a double bond, aromatic bond, ring, charge, stereochemical marker, or label is ambiguous, mention it in warnings.
- Do not invent missing atoms or bonds.
- If this is not a single molecule structure, set smiles to null and explain why in warnings.
- Do not include markdown fences or prose outside JSON.${context}${fileName}`;
}

function extractText(payload: any): string {
  const blocks = Array.isArray(payload?.content) ? payload.content : [];
  return blocks
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function parseModelJson(rawText: string): any {
  const withoutFence = rawText
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    const match = withoutFence.match(/\{[\s\S]*\}/);
    if (!match) {
      return {
        smiles: null,
        confidence: 'low',
        warnings: ['Parser response was not valid JSON.'],
      };
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return {
        smiles: null,
        confidence: 'low',
        warnings: ['Parser response JSON could not be parsed.'],
      };
    }
  }
}

function normalizeConfidence(value: unknown): 'high' | 'medium' | 'low' {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'low';
}

function sanitizeUpstreamError(payload: any): string {
  if (typeof payload?.error?.message === 'string') {
    return payload.error.message;
  }
  if (typeof payload === 'string') {
    return payload.slice(0, 500);
  }
  return 'No upstream error detail returned.';
}

function sendJson(res: any, status: number, value: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(status === 204 ? '' : JSON.stringify(value));
}
