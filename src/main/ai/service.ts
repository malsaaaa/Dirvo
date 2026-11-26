import type { ActionResult, AiExplainResult } from '../../shared/types'
import { AiCache, cacheKey } from './cache'
import { AiRequestError, callClaude } from './client'
import type { KeyStore } from './key-store'
import { validateMetadata } from './metadata-validate'
import { buildUserMessage, PROMPT_VERSION, SYSTEM_PROMPT } from './prompt'
import { buildPayload } from './sanitize'
import { AiValidationError, parseAiAnswer, toExplanation } from './validate'

export interface AiServiceDeps {
  keyStore: KeyStore
  cache: AiCache
  /** Names to hide from the AI (the current Windows username, home folder name, ...). */
  usernames: () => string[]
  fetchImpl?: typeof fetch
}

/**
 * Explains an unknown folder with the AI. Order: validate input, redact username, check the cache,
 * call the API, validate the reply, cache it, then apply the confidence policy.
 */
export async function explainWithAi(rawMetadata: unknown, deps: AiServiceDeps): Promise<AiExplainResult> {
  let payload
  try {
    payload = buildPayload(validateMetadata(rawMetadata), deps.usernames())
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Invalid folder data' }
  }

  const key = cacheKey(payload.path, PROMPT_VERSION)
  const cached = await deps.cache.get(key)
  if (cached) return { status: 'ok', explanation: toExplanation(cached), cached: true }

  const apiKey = await deps.keyStore.load()
  if (!apiKey) return { status: 'no-key' }

  try {
    const text = await callClaude({
      apiKey,
      system: SYSTEM_PROMPT,
      user: buildUserMessage(payload),
      fetchImpl: deps.fetchImpl
    })
    const answer = parseAiAnswer(text)
    await deps.cache.set(key, answer)
    return { status: 'ok', explanation: toExplanation(answer), cached: false }
  } catch (err) {
    if (err instanceof AiRequestError) return { status: 'error', message: err.message }
    if (err instanceof AiValidationError) {
      return { status: 'error', message: 'The AI gave an answer Dirvo could not trust, so it was discarded. Try again.' }
    }
    return { status: 'error', message: 'Something went wrong while asking the AI.' }
  }
}

export async function testApiKey(deps: Pick<AiServiceDeps, 'keyStore' | 'fetchImpl'>): Promise<ActionResult> {
  const apiKey = await deps.keyStore.load()
  if (!apiKey) return { ok: false, message: 'No API key is saved.' }
  try {
    await callClaude({ apiKey, system: 'Reply with the single word OK.', user: 'ping', maxTokens: 8, fetchImpl: deps.fetchImpl })
    return { ok: true, message: 'Connection works.' }
  } catch (err) {
    return { ok: false, message: err instanceof AiRequestError ? err.message : 'The test failed.' }
  }
}
