import type { ProviderId } from '../../shared/providers'
import type { ActionResult, AiExplainResult } from '../../shared/types'
import { AiCache, cacheKey } from './cache'
import { AiRequestError, callLlm } from './client'
import type { KeyStore } from './key-store'
import { validateMetadata } from './metadata-validate'
import type { AiSettingsStore } from './provider-settings'
import { buildFileUserMessage, buildUserMessage, FILE_SYSTEM_PROMPT, PROMPT_VERSION, SYSTEM_PROMPT } from './prompt'
import { buildFilePayload, buildPayload } from './sanitize'
import { AiValidationError, parseAiAnswer, toExplanation } from './validate'

export interface AiServiceDeps {
  settings: AiSettingsStore
  /** One encrypted key store per provider, so switching providers keeps each key. */
  keyStoreFor: (provider: ProviderId) => KeyStore
  cache: AiCache
  /** Names to hide from the AI (the current Windows username, home folder name, ...). */
  usernames: () => string[]
  fetchImpl?: typeof fetch
}

/**
 * Explains an unknown folder or file with the chosen AI provider. Order: validate input, redact username,
 * check the cache, call the API, validate the reply, cache it, then apply the confidence policy.
 * The same steps run for every provider.
 */
export async function explainWithAi(rawMetadata: unknown, deps: AiServiceDeps): Promise<AiExplainResult> {
  let payload: { path: string }
  let system = SYSTEM_PROMPT
  let user: string
  try {
    const meta = validateMetadata(rawMetadata)
    if (meta.kind === 'file') {
      const filePayload = buildFilePayload(meta, deps.usernames())
      payload = filePayload
      system = FILE_SYSTEM_PROMPT
      user = buildFileUserMessage(filePayload)
    } else {
      const folderPayload = buildPayload(meta, deps.usernames())
      payload = folderPayload
      user = buildUserMessage(folderPayload)
    }
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Invalid folder data' }
  }

  const cfg = await deps.settings.resolve()
  // Files and folders are asked with different prompts, so they never share a cached answer.
  const key = cacheKey(payload.path, PROMPT_VERSION, `${system === FILE_SYSTEM_PROMPT ? 'file/' : ''}${cfg.provider.id}/${cfg.model}`)
  const cached = await deps.cache.get(key)
  if (cached) return { status: 'ok', explanation: toExplanation(cached), cached: true }

  const apiKey = cfg.provider.keyMode === 'none' ? null : await deps.keyStoreFor(cfg.provider.id).load()
  if (cfg.provider.keyMode === 'required' && !apiKey) return { status: 'no-key' }

  try {
    const text = await callLlm({
      provider: cfg.provider,
      model: cfg.model,
      baseUrl: cfg.baseUrl,
      apiKey,
      system,
      user,
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

export async function testApiKey(deps: Pick<AiServiceDeps, 'settings' | 'keyStoreFor' | 'fetchImpl'>): Promise<ActionResult> {
  const cfg = await deps.settings.resolve()
  const apiKey = cfg.provider.keyMode === 'none' ? null : await deps.keyStoreFor(cfg.provider.id).load()
  if (cfg.provider.keyMode === 'required' && !apiKey) return { ok: false, message: 'No API key is saved for this provider.' }
  try {
    await callLlm({
      provider: cfg.provider,
      model: cfg.model,
      baseUrl: cfg.baseUrl,
      apiKey,
      system: 'Reply with the single word OK.',
      user: 'ping',
      maxTokens: 512, // reasoning models need room to think before the one-word answer
      fetchImpl: deps.fetchImpl
    })
    return { ok: true, message: 'Connection works.' }
  } catch (err) {
    return { ok: false, message: err instanceof AiRequestError ? err.message : 'The test failed.' }
  }
}
