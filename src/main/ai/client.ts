import { hostOf, isLoopbackUrl, type ProviderInfo } from '../../shared/providers'

const ANTHROPIC_VERSION = '2023-06-01'

export type AiErrorKind = 'auth' | 'rate-limit' | 'not-found' | 'bad-request' | 'network' | 'timeout' | 'server' | 'bad-response'

export class AiRequestError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string
  ) {
    super(message)
    this.name = 'AiRequestError'
  }
}

export interface LlmRequest {
  provider: ProviderInfo
  model: string
  /** API address, without a trailing slash. */
  baseUrl: string
  /** Null for local servers that need no key. */
  apiKey: string | null
  system: string
  user: string
  maxTokens?: number
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

interface HttpCall {
  url: string
  headers: Record<string, string>
  body: unknown
}

/** Builds the HTTP request for each wire format. Keys go in headers, never in URLs or bodies. */
function buildCall(r: LlmRequest): HttpCall {
  const maxTokens = r.maxTokens ?? 1024
  const json = { 'content-type': 'application/json' }

  switch (r.provider.protocol) {
    case 'anthropic':
      return {
        url: `${r.baseUrl}/messages`,
        headers: { ...json, 'x-api-key': r.apiKey ?? '', 'anthropic-version': ANTHROPIC_VERSION },
        body: { model: r.model, max_tokens: maxTokens, system: r.system, messages: [{ role: 'user', content: r.user }] }
      }
    case 'openai':
      return {
        url: `${r.baseUrl}/chat/completions`,
        headers: r.apiKey ? { ...json, authorization: `Bearer ${r.apiKey}` } : json,
        body: {
          model: r.model,
          [r.provider.tokenParam]: maxTokens,
          messages: [
            { role: 'system', content: r.system },
            { role: 'user', content: r.user }
          ]
        }
      }
    case 'gemini':
      return {
        url: `${r.baseUrl}/models/${encodeURIComponent(r.model)}:generateContent`,
        headers: { ...json, 'x-goog-api-key': r.apiKey ?? '' },
        body: {
          systemInstruction: { parts: [{ text: r.system }] },
          contents: [{ role: 'user', parts: [{ text: r.user }] }],
          generationConfig: { maxOutputTokens: maxTokens, responseMimeType: 'application/json' }
        }
      }
  }
}

/** Pulls the reply text out of each wire format. Returns undefined if it is not where it should be. */
function extractText(protocol: ProviderInfo['protocol'], body: unknown): string | undefined {
  const b = body as Record<string, unknown> | null
  if (!b || typeof b !== 'object') return undefined

  if (protocol === 'anthropic') {
    const content = b.content
    if (!Array.isArray(content)) return undefined
    const t = content.find((c: { type?: string }) => c?.type === 'text') as { text?: unknown } | undefined
    return typeof t?.text === 'string' ? t.text : undefined
  }

  if (protocol === 'openai') {
    const choices = b.choices
    if (!Array.isArray(choices)) return undefined
    const content = (choices[0] as { message?: { content?: unknown } } | undefined)?.message?.content
    return typeof content === 'string' && content.length > 0 ? content : undefined
  }

  const candidates = b.candidates
  if (!Array.isArray(candidates)) return undefined
  const parts = (candidates[0] as { content?: { parts?: Array<{ text?: unknown }> } } | undefined)?.content?.parts
  if (!Array.isArray(parts)) return undefined
  const text = parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('')
  return text.length > 0 ? text : undefined
}

/**
 * One request to an AI provider. Runs in the main process only; keys never reach the renderer.
 * Error messages are fixed strings, so neither the key nor response bodies leak.
 */
export async function callLlm(req: LlmRequest): Promise<string> {
  const doFetch = req.fetchImpl ?? fetch
  const local = isLoopbackUrl(req.baseUrl)
  const call = buildCall(req)
  const controller = new AbortController()
  // A local model may need a while to load on its first request.
  const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? (local ? 120_000 : 30_000))

  let res: Response
  try {
    res = await doFetch(call.url, {
      method: 'POST',
      signal: controller.signal,
      headers: call.headers,
      body: JSON.stringify(call.body)
    })
  } catch {
    if (controller.signal.aborted) throw new AiRequestError('timeout', 'The AI took too long to answer. Try again.')
    throw new AiRequestError(
      'network',
      local
        ? `Could not reach ${req.provider.label.replace(/\s*\(.*\)$/, '')} at ${hostOf(req.baseUrl)}. Is it running?`
        : 'Could not reach the AI service. Check your internet connection.'
    )
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 401 || res.status === 403) {
    throw new AiRequestError('auth', 'The API key was rejected. Check it in Settings.')
  }
  if (res.status === 404) {
    throw new AiRequestError('not-found', 'The model or address was not found. Check the model name in Settings.')
  }
  if (res.status === 429) throw new AiRequestError('rate-limit', 'The AI service is rate limiting requests. Try again shortly.')
  if (res.status === 400 || res.status === 422) {
    throw new AiRequestError('bad-request', `The AI service rejected the request (${res.status}). Check the key and model in Settings.`)
  }
  if (!res.ok) throw new AiRequestError('server', `The AI service returned an error (${res.status}). Try again later.`)

  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new AiRequestError('bad-response', 'The AI service sent an unreadable response.')
  }

  const text = extractText(req.provider.protocol, body)
  if (text === undefined) throw new AiRequestError('bad-response', 'The AI service sent an unexpected response.')
  return text
}
