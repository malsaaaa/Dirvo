import { promises as fsp } from 'node:fs'
import { dirname } from 'node:path'
import {
  DEFAULT_PROVIDER,
  getProvider,
  isLoopbackHost,
  isProviderId,
  type ProviderId,
  type ProviderInfo
} from '../../shared/providers'
import type { AiConfigInput } from '../../shared/types'

export class SettingsError extends Error {}

/** What the AI layer actually uses: the chosen provider with its model and address filled in. */
export interface ResolvedAiConfig {
  provider: ProviderInfo
  model: string
  baseUrl: string
}

const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,99}$/

export function validateModel(model: string): string {
  const m = model.trim()
  if (!MODEL_RE.test(m)) {
    throw new SettingsError('Enter a model name, like gpt-4o-mini (letters, numbers and . _ : / - only)')
  }
  return m
}

/**
 * Addresses for local servers. Must be http(s) with no embedded login. Plain http is only allowed
 * for this PC (localhost), so folder metadata is never sent over an unencrypted connection to
 * another machine.
 */
export function validateBaseUrl(input: string): string {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new SettingsError('Enter a full address, like http://localhost:11434/v1')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SettingsError('The address must start with http:// or https://')
  }
  if (url.username || url.password) throw new SettingsError('Do not put a login in the address')
  if (url.protocol === 'http:' && !isLoopbackHost(url.hostname)) {
    throw new SettingsError('Plain http is only allowed for localhost. Use https:// for other machines.')
  }
  if (url.search || url.hash) throw new SettingsError('The address should not have a query or fragment')
  return url.toString().replace(/\/+$/, '')
}

interface Stored {
  provider: ProviderId
  models: Partial<Record<ProviderId, string>>
  baseUrls: Partial<Record<ProviderId, string>>
}

/** Provider, model and address choices, kept in a small JSON file. No secrets are stored here. */
export class AiSettingsStore {
  private cache: Stored | null = null

  constructor(private readonly filePath: string) {}

  private async load(): Promise<Stored> {
    if (this.cache) return this.cache
    const stored: Stored = { provider: DEFAULT_PROVIDER, models: {}, baseUrls: {} }
    try {
      const raw: unknown = JSON.parse(await fsp.readFile(this.filePath, 'utf8'))
      if (raw && typeof raw === 'object') {
        const o = raw as Record<string, unknown>
        if (isProviderId(o.provider)) stored.provider = o.provider
        for (const [field, target] of [
          ['models', stored.models],
          ['baseUrls', stored.baseUrls]
        ] as const) {
          const map = o[field]
          if (map && typeof map === 'object') {
            for (const [k, v] of Object.entries(map as Record<string, unknown>)) {
              if (isProviderId(k) && typeof v === 'string') target[k] = v
            }
          }
        }
      }
    } catch {
      // Missing or corrupt file: use defaults.
    }
    this.cache = stored
    return stored
  }

  /** The active setup. Bad stored values fall back to the provider's defaults. */
  async resolve(): Promise<ResolvedAiConfig> {
    const s = await this.load()
    const provider = getProvider(s.provider) ?? (getProvider(DEFAULT_PROVIDER) as ProviderInfo)
    let model = provider.defaultModel
    try {
      if (s.models[provider.id]) model = validateModel(s.models[provider.id] as string)
    } catch {
      // keep default
    }
    let baseUrl = provider.defaultBaseUrl
    if (provider.baseUrlEditable && s.baseUrls[provider.id]) {
      try {
        baseUrl = validateBaseUrl(s.baseUrls[provider.id] as string)
      } catch {
        // keep default
      }
    }
    return { provider, model, baseUrl }
  }

  /**
   * Saves the choice. An empty model or address means "keep what is already saved for this provider
   * (or its default)", which is what switching providers in Settings sends.
   */
  async set(input: AiConfigInput): Promise<void> {
    const provider = isProviderId(input.provider) ? getProvider(input.provider) : undefined
    if (!provider) throw new SettingsError('Unknown provider')
    const s = await this.load()

    const rawModel = typeof input.model === 'string' ? input.model.trim() : ''
    const model = rawModel ? validateModel(rawModel) : (s.models[provider.id] ?? provider.defaultModel)

    const next: Stored = { provider: provider.id, models: { ...s.models, [provider.id]: model }, baseUrls: { ...s.baseUrls } }
    if (provider.baseUrlEditable) {
      const rawUrl = typeof input.baseUrl === 'string' ? input.baseUrl.trim() : ''
      next.baseUrls[provider.id] = rawUrl ? validateBaseUrl(rawUrl) : (s.baseUrls[provider.id] ?? provider.defaultBaseUrl)
    }
    await fsp.mkdir(dirname(this.filePath), { recursive: true })
    await fsp.writeFile(this.filePath, JSON.stringify(next, null, 2))
    this.cache = next
  }
}
