export const MODEL = 'claude-haiku-5-5'
const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

export type AiErrorKind = 'auth' | 'rate-limit' | 'network' | 'timeout' | 'server' | 'bad-response'

export class AiRequestError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string
  ) {
    super(message)
    this.name = 'AiRequestError'
  }
}

export interface CallOptions {
  apiKey: string
  system: string
  user: string
  maxTokens?: number
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

/**
 * One request to the Anthropic Messages API. Runs in the main process only; the key never reaches
 * the renderer. Error messages are fixed strings, so neither the key nor response bodies leak.
 */
export async function callClaude(opts: CallOptions): Promise<string> {
  const doFetch = opts.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000)

  let res: Response
  try {
    res = await doFetch(API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': API_VERSION
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: opts.maxTokens ?? 600,
        system: opts.system,
        messages: [{ role: 'user', content: opts.user }]
      })
    })
  } catch (err) {
    if (controller.signal.aborted) throw new AiRequestError('timeout', 'The AI took too long to answer. Try again.')
    void err
    throw new AiRequestError('network', 'Could not reach the AI service. Check your internet connection.')
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 401 || res.status === 403) {
    throw new AiRequestError('auth', 'The API key was rejected. Check it in Settings.')
  }
  if (res.status === 429) throw new AiRequestError('rate-limit', 'The AI service is rate limiting requests. Try again shortly.')
  if (!res.ok) throw new AiRequestError('server', `The AI service returned an error (${res.status}). Try again later.`)

  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new AiRequestError('bad-response', 'The AI service sent an unreadable response.')
  }

  const content = (body as { content?: Array<{ type?: string; text?: unknown }> })?.content
  const text = Array.isArray(content) ? content.find((c) => c?.type === 'text')?.text : undefined
  if (typeof text !== 'string') throw new AiRequestError('bad-response', 'The AI service sent an unexpected response.')
  return text
}
