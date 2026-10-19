import 'server-only';

// Thin client for FreeLLMAPI's OpenAI-compatible /v1/chat/completions.

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type ChatResult = {
  content: string;
  requestedModel: string;
  servedModel: string; // what actually answered (model id reported by the router)
  routedVia: string | null; // provider, from the x-routed-via header
  usedFallback: boolean;
  ms: number;
};

// Model ids are user-editable in the UI, so only allow a safe character set.
const MODEL_RE = /^[A-Za-z0-9._:\/-]{1,100}$/;
export function isValidModel(m: unknown): m is string {
  return typeof m === 'string' && MODEL_RE.test(m);
}

function config() {
  const baseUrl = (process.env.FREELLMAPI_BASE_URL || 'http://localhost:3001/v1').replace(/\/+$/, '');
  const apiKey = process.env.FREELLMAPI_API_KEY;
  if (!apiKey) throw new Error('FREELLMAPI_API_KEY is not set. Copy .env.example to .env.local and add your unified key.');
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS) || 120_000;
  return { baseUrl, apiKey, timeoutMs };
}

async function callOnce(model: string, messages: ChatMessage[], signal?: AbortSignal) {
  const { baseUrl, apiKey, timeoutMs } = config();
  const timeout = AbortSignal.timeout(timeoutMs);
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature: 0.4 }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    cache: 'no-store',
  });
  if (!res.ok) {
    // Keep error text short; upstream bodies can be large or echo request data.
    const text = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`HTTP ${res.status} for model "${model}": ${text}`);
  }
  const data = (await res.json()) as {
    model?: string;
    choices?: { message?: { content?: string | null } }[];
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error(`Empty response from model "${model}"`);
  return { content, servedModel: data.model || model, routedVia: res.headers.get('x-routed-via') };
}

/** Ask `model`; on any failure retry once with the `fallback` routing strategy. */
export async function chat(
  model: string,
  fallback: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<ChatResult> {
  const start = Date.now();
  try {
    const r = await callOnce(model, messages, signal);
    return { ...r, requestedModel: model, usedFallback: false, ms: Date.now() - start };
  } catch (err) {
    if (signal?.aborted || model === fallback) throw err;
    const r = await callOnce(fallback, messages, signal);
    return { ...r, requestedModel: model, usedFallback: true, ms: Date.now() - start };
  }
}
