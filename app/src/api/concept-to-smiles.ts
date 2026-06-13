// Client helper for the concept → SMILES proxy (sibling of extract-smiles.ts).
// The browser never holds ANTHROPIC_API_KEY — it POSTs the concept text to the
// serverless /api/concept-to-smiles, which calls Claude server-side. An optional
// x-demo-key rides along when the deploy gates the endpoint.

export type ConceptToSmilesRequest = {
  concept: string;
  context?: string;
};

export type ConceptToSmilesResponse = {
  smiles: string | null;
  name: string | null;
  confidence: 'high' | 'medium' | 'low';
  warnings: string[];
  model?: string;
};

export type ConceptToSmilesProxyOptions = {
  endpoint?: string;
  demoKey?: string;
  fetchImpl?: typeof fetch;
};

export async function conceptToSmilesViaProxy(
  request: ConceptToSmilesRequest,
  options: ConceptToSmilesProxyOptions = {},
): Promise<ConceptToSmilesResponse> {
  const endpoint = options.endpoint ?? '/api/concept-to-smiles';
  const demoKey = options.demoKey?.trim();
  const fetchImpl = options.fetchImpl ?? fetch;

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (demoKey) {
    headers['x-demo-key'] = demoKey;
  }

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof payload?.error === 'string'
        ? payload.error
        : `Concept generation failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  return {
    smiles: typeof payload?.smiles === 'string' ? payload.smiles : null,
    name: typeof payload?.name === 'string' ? payload.name : null,
    confidence:
      payload?.confidence === 'high' || payload?.confidence === 'medium'
        ? payload.confidence
        : 'low',
    warnings: Array.isArray(payload?.warnings) ? payload.warnings.map(String) : [],
    model: typeof payload?.model === 'string' ? payload.model : undefined,
  };
}
