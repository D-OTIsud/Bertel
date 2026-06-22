/**
 * Provider adapter for /api/menu/extract (Phase 2). The OpenAI-compatible Chat Completions vision
 * schema is the lingua franca that covers OpenAI, OpenRouter, Groq, vLLM, Ollama, Kimi/Moonshot,
 * Together, … (locked decision D1). Parameterised by base URL + key + model, so "multi-provider"
 * is one adapter, not N integrations. A native Anthropic adapter can be added later.
 *
 * No secrets are read here — the route passes the decrypted key (from Vault, service_role) in.
 */

export interface ProviderConfig {
  apiKind: 'openai_compatible' | 'anthropic';
  baseUrl: string;
  model: string;
  maxOutputTokens: number;
  extra?: Record<string, unknown> | null;
}

export interface VisionImage {
  mime: string;
  base64: string;
}

export class ProviderError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function extraHeaders(extra: ProviderConfig['extra']): Record<string, string> {
  const h = extra && typeof extra === 'object' ? (extra as Record<string, unknown>).headers : undefined;
  if (h && typeof h === 'object') {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  }
  return {};
}

/**
 * Call a vision model with the carte images + extraction prompt; return the raw text completion.
 * Validation/parsing of that text is the caller's job (parseExtraction).
 */
export async function callVisionExtraction(
  config: ProviderConfig,
  apiKey: string | null,
  images: VisionImage[],
  prompt: { system: string; user: string },
  opts?: { fetchImpl?: typeof fetch; signal?: AbortSignal },
): Promise<{ text: string; usage?: unknown }> {
  if (config.apiKind === 'anthropic') {
    throw new ProviderError(
      "Le fournisseur « anthropic » (API native) n'est pas encore pris en charge. Utilisez un fournisseur OpenAI-compatible.",
    );
  }

  const fetchImpl = opts?.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders(config.extra),
  };
  if (apiKey && apiKey.trim()) headers['Authorization'] = `Bearer ${apiKey.trim()}`;

  const imageParts = images.map((img) => ({
    type: 'image_url',
    image_url: { url: `data:${img.mime};base64,${img.base64}` },
  }));

  const body = {
    model: config.model,
    max_tokens: config.maxOutputTokens,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: [{ type: 'text', text: prompt.user }, ...imageParts] },
    ],
  };

  let resp: Response;
  try {
    resp = await fetchImpl(joinUrl(config.baseUrl, 'chat/completions'), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: opts?.signal,
    });
  } catch (err) {
    throw new ProviderError(`appel fournisseur échoué: ${err instanceof Error ? err.message : 'inconnu'}`);
  }

  if (!resp.ok) {
    let detail = '';
    try {
      detail = (await resp.text()).slice(0, 500);
    } catch {
      /* ignore */
    }
    throw new ProviderError(`fournisseur a répondu ${resp.status}: ${detail}`, resp.status);
  }

  let data: { choices?: Array<{ message?: { content?: unknown } }>; usage?: unknown };
  try {
    data = await resp.json();
  } catch {
    throw new ProviderError('réponse du fournisseur illisible (JSON attendu)');
  }

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    throw new ProviderError('le fournisseur n’a renvoyé aucun contenu');
  }

  return { text: content, usage: data.usage };
}
