import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PROVIDERS, getProvider, hostOf, isLoopbackUrl, isProviderId, type ProviderId } from '../src/shared/providers'
import { AiCache } from '../src/main/ai/cache'
import { AiRequestError, callLlm, type LlmRequest } from '../src/main/ai/client'
import { KeyFormatError, KeyStore, normalizeKey, type Encryptor } from '../src/main/ai/key-store'
import { AiSettingsStore, SettingsError, validateBaseUrl, validateModel } from '../src/main/ai/provider-settings'
import { explainWithAi, testApiKey, type AiServiceDeps } from '../src/main/ai/service'
import { meta } from './helpers'

const enc: Encryptor = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(s).reverse(),
  decryptString: (b) => Buffer.from(b).reverse().toString()
}

const ANSWER = JSON.stringify({
  whatItIs: 'Cache of Acme app.',
  createdBy: 'Acme',
  verdict: 'REBUILDS_AUTOMATICALLY',
  confidence: 'HIGH',
  consequenceIfDeleted: 'Acme rebuilds it.'
})

/** Each wire format wraps the same reply text differently. */
const wrap = {
  anthropic: (text: string) => ({ content: [{ type: 'text', text }] }),
  openai: (text: string) => ({ choices: [{ message: { role: 'assistant', content: text } }] }),
  gemini: (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] })
}

describe('provider catalog', () => {
  it('has unique ids and complete entries', () => {
    const ids = PROVIDERS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of PROVIDERS) {
      expect(p.label, p.id).not.toBe('')
      expect(p.defaultModel, p.id).not.toBe('')
      expect(() => new URL(p.defaultBaseUrl), p.id).not.toThrow()
      expect(p.defaultBaseUrl.endsWith('/'), p.id).toBe(false)
    }
  })

  it('covers the famous providers', () => {
    for (const id of ['anthropic', 'openai', 'gemini', 'mistral', 'xai', 'deepseek', 'groq', 'openrouter', 'ollama', 'custom']) {
      expect(isProviderId(id), id).toBe(true)
    }
    expect(isProviderId('nope')).toBe(false)
    expect(isProviderId(5)).toBe(false)
  })

  it('hosted providers use https and cannot have their address changed', () => {
    for (const p of PROVIDERS.filter((x) => !x.baseUrlEditable)) {
      expect(p.defaultBaseUrl.startsWith('https://'), p.id).toBe(true)
      expect(p.keyMode, p.id).toBe('required')
    }
  })

  it('local providers are on localhost and need no required key', () => {
    expect(getProvider('ollama')).toMatchObject({ keyMode: 'none', baseUrlEditable: true })
    expect(getProvider('custom')).toMatchObject({ keyMode: 'optional', baseUrlEditable: true })
    expect(isLoopbackUrl(getProvider('ollama')!.defaultBaseUrl)).toBe(true)
  })

  it('helpers read addresses correctly', () => {
    expect(isLoopbackUrl('http://localhost:11434/v1')).toBe(true)
    expect(isLoopbackUrl('http://127.0.0.1:1234')).toBe(true)
    expect(isLoopbackUrl('http://[::1]:8080')).toBe(true)
    expect(isLoopbackUrl('https://api.openai.com/v1')).toBe(false)
    expect(isLoopbackUrl('http://localhost.evil.com')).toBe(false)
    expect(isLoopbackUrl('garbage')).toBe(false)
    expect(hostOf('https://api.x.ai/v1')).toBe('api.x.ai')
  })
})

describe('callLlm request and response formats', () => {
  let calls: Array<{ url: string; init: RequestInit }>
  let respond: () => Response
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return respond()
  }) as unknown as typeof fetch

  const req = (id: ProviderId, over: Partial<LlmRequest> = {}): LlmRequest => {
    const p = getProvider(id)!
    return { provider: p, model: p.defaultModel, baseUrl: p.defaultBaseUrl, apiKey: 'KEY12345678901234567', system: 'SYS', user: 'USER', fetchImpl, ...over }
  }
  const headers = (): Record<string, string> => calls[0].init.headers as Record<string, string>
  const body = (): Record<string, unknown> => JSON.parse(String(calls[0].init.body))

  beforeEach(() => {
    calls = []
    respond = () => new Response('{}')
  })

  it('Anthropic: /messages with x-api-key and system field', async () => {
    respond = () => new Response(JSON.stringify(wrap.anthropic('hi')))
    expect(await callLlm(req('anthropic'))).toBe('hi')
    expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages')
    expect(headers()['x-api-key']).toBe('KEY12345678901234567')
    expect(headers()['anthropic-version']).toBeTruthy()
    expect(body()).toMatchObject({ model: 'claude-haiku-5-5', system: 'SYS', messages: [{ role: 'user', content: 'USER' }] })
  })

  it('OpenAI: chat/completions, bearer auth, max_completion_tokens', async () => {
    respond = () => new Response(JSON.stringify(wrap.openai('hi')))
    expect(await callLlm(req('openai'))).toBe('hi')
    expect(calls[0].url).toBe('https://api.openai.com/v1/chat/completions')
    expect(headers().authorization).toBe('Bearer KEY12345678901234567')
    expect(body()).toMatchObject({
      model: 'gpt-4o-mini',
      max_completion_tokens: 4096,
      messages: [
        { role: 'system', content: 'SYS' },
        { role: 'user', content: 'USER' }
      ]
    })
    expect(body()).not.toHaveProperty('max_tokens')
  })

  it.each(['mistral', 'xai', 'deepseek', 'groq', 'openrouter'] as const)('%s: OpenAI format with max_tokens at its own address', async (id) => {
    respond = () => new Response(JSON.stringify(wrap.openai('hi')))
    expect(await callLlm(req(id))).toBe('hi')
    expect(calls[0].url).toBe(`${getProvider(id)!.defaultBaseUrl}/chat/completions`)
    expect(headers().authorization).toBe('Bearer KEY12345678901234567')
    expect(body()).toHaveProperty("max_tokens", 4096)
  })

  it('Gemini: key in a header (never the URL), systemInstruction, model in the path', async () => {
    respond = () => new Response(JSON.stringify(wrap.gemini('hi')))
    expect(await callLlm(req('gemini'))).toBe('hi')
    expect(calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent')
    expect(calls[0].url).not.toContain('KEY123')
    expect(headers()['x-goog-api-key']).toBe('KEY12345678901234567')
    expect(body()).toMatchObject({
      systemInstruction: { parts: [{ text: 'SYS' }] },
      contents: [{ role: 'user', parts: [{ text: 'USER' }] }]
    })
  })

  it('Gemini: joins multi-part replies and escapes odd model names', async () => {
    respond = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] }))
    expect(await callLlm(req('gemini', { model: 'tuned/model v1' }))).toBe('ab')
    expect(calls[0].url).toContain('/models/tuned%2Fmodel%20v1:generateContent')
  })

  it('Ollama: no authorization header at all, local address, thinking turned off', async () => {
    respond = () => new Response(JSON.stringify(wrap.openai('hi')))
    expect(await callLlm(req('ollama', { apiKey: null }))).toBe('hi')
    expect(calls[0].url).toBe('http://localhost:11434/v1/chat/completions')
    expect(headers()).not.toHaveProperty('authorization')
    // Without this, a thinking model can use its whole budget reasoning and return an empty answer.
    expect(body()).toHaveProperty('reasoning_effort', 'none')
  })

  it('only Ollama gets the thinking switch; other providers never receive unknown fields', async () => {
    respond = () => new Response(JSON.stringify(wrap.openai('hi')))
    for (const id of ['openai', 'mistral', 'xai', 'deepseek', 'groq', 'openrouter', 'custom'] as const) {
      calls = []
      await callLlm(req(id))
      expect(body(), id).not.toHaveProperty('reasoning_effort')
    }
  })

  it('gives reasoning models a generous output budget', async () => {
    respond = () => new Response(JSON.stringify(wrap.gemini('hi')))
    await callLlm(req('gemini'))
    expect((body().generationConfig as { maxOutputTokens: number }).maxOutputTokens).toBeGreaterThanOrEqual(4096)
  })

  it('Custom: sends a key only when one is saved, at the configured address', async () => {
    respond = () => new Response(JSON.stringify(wrap.openai('hi')))
    await callLlm(req('custom', { baseUrl: 'http://localhost:5000/v1', apiKey: null }))
    expect(headers()).not.toHaveProperty('authorization')
    calls = []
    await callLlm(req('custom', { baseUrl: 'https://my.server/v1', apiKey: 'KEY12345678901234567' }))
    expect(calls[0].url).toBe('https://my.server/v1/chat/completions')
    expect(headers().authorization).toBe('Bearer KEY12345678901234567')
  })

  it.each([
    [401, 'auth', /rejected/i],
    [403, 'auth', /rejected/i],
    [404, 'not-found', /model or address/i],
    [400, 'bad-request', /rejected the request \(400\)/i],
    [422, 'bad-request', /\(422\)/],
    [429, 'rate-limit', /rate limit/i],
    [503, 'server', /error \(503\)/i]
  ])('maps HTTP %i without leaking the response body', async (status, kind, pattern) => {
    respond = () => new Response('{"error":"secret details KEY12345678901234567"}', { status })
    const err = await callLlm(req('openai')).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AiRequestError)
    expect((err as AiRequestError).kind).toBe(kind)
    expect((err as AiRequestError).message).toMatch(pattern)
    expect((err as AiRequestError).message).not.toContain('secret')
    expect((err as AiRequestError).message).not.toContain('KEY123')
  })

  it('network failure: hosted says check the internet, local says is it running', async () => {
    const down = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    await expect(callLlm(req('openai', { fetchImpl: down }))).rejects.toThrow(/internet/i)
    await expect(callLlm(req('ollama', { fetchImpl: down, apiKey: null }))).rejects.toThrow(/Ollama.*localhost:11434.*running/i)
  })

  it('times out slow servers', async () => {
    const slow = ((_u: string, init: RequestInit) =>
      new Promise((_res, rej) => {
        init.signal?.addEventListener('abort', () => rej(new Error('aborted')))
      })) as unknown as typeof fetch
    await expect(callLlm(req('openai', { fetchImpl: slow, timeoutMs: 20 }))).rejects.toMatchObject({ kind: 'timeout' })
  })

  it.each([
    ['anthropic', { content: [] }],
    ['anthropic', { nope: 1 }],
    ['openai', { choices: [] }],
    ['openai', { choices: [{ message: { content: '' } }] }],
    ['openai', { choices: [{ message: { content: null } }] }],
    ['gemini', { candidates: [] }],
    ['gemini', { promptFeedback: { blockReason: 'SAFETY' } }]
  ] as const)('%s with an unexpected body is a bad-response error', async (id, bad) => {
    respond = () => new Response(JSON.stringify(bad))
    await expect(callLlm(req(id))).rejects.toMatchObject({ kind: 'bad-response' })
  })
})

describe('key validation', () => {
  it('accepts normal keys for any provider and rejects obvious mistakes', () => {
    expect(normalizeKey('  AIzaSyDUMMYKEYDUMMYKEY123456  ', 'gemini')).toBe('AIzaSyDUMMYKEYDUMMYKEY123456')
    expect(normalizeKey('sk-proj-abcdefghijklmnopqrstuvwxyz', 'openai')).toBeTruthy()
    expect(normalizeKey('anyformatkey_1234567890', 'mistral')).toBeTruthy()
    expect(() => normalizeKey('short', 'openai')).toThrow(KeyFormatError)
    expect(() => normalizeKey('has space inside the key 12345', 'openai')).toThrow(KeyFormatError)
    expect(() => normalizeKey('line\nbreak1234567890123', 'groq')).toThrow(KeyFormatError)
  })

  it('still insists on the sk-ant- format for Anthropic', () => {
    expect(() => normalizeKey('sk-proj-abcdefghijklmnopqrstuvwxyz', 'anthropic')).toThrow(/sk-ant-/)
    expect(normalizeKey('sk-ant-api03-abcdefghijklmnopqrstuvwxyz', 'anthropic')).toBeTruthy()
  })
})

describe('AiSettingsStore', () => {
  let dir: string
  let file: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dirvo-set-'))
    file = join(dir, 'settings.json')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('defaults to Anthropic with its default model', async () => {
    const c = await new AiSettingsStore(file).resolve()
    expect(c.provider.id).toBe('anthropic')
    expect(c.model).toBe('claude-haiku-5-5')
    expect(c.baseUrl).toBe('https://api.anthropic.com/v1')
  })

  it('saves provider and model and remembers them across instances', async () => {
    await new AiSettingsStore(file).set({ provider: 'openai', model: 'gpt-4.1-mini', baseUrl: '' })
    const c = await new AiSettingsStore(file).resolve()
    expect(c.provider.id).toBe('openai')
    expect(c.model).toBe('gpt-4.1-mini')
  })

  it('keeps a separate model per provider and restores it when switching back', async () => {
    const s = new AiSettingsStore(file)
    await s.set({ provider: 'openai', model: 'my-openai-model', baseUrl: '' })
    await s.set({ provider: 'gemini', model: 'my-gemini-model', baseUrl: '' })
    await s.set({ provider: 'openai', model: '', baseUrl: '' }) // empty = keep what is saved
    expect((await s.resolve()).model).toBe('my-openai-model')
    await s.set({ provider: 'groq', model: '', baseUrl: '' }) // never configured = default
    expect((await s.resolve()).model).toBe(getProvider('groq')!.defaultModel)
  })

  it('stores the address only for providers that allow it', async () => {
    const s = new AiSettingsStore(file)
    await s.set({ provider: 'ollama', model: 'llama3.2:3b', baseUrl: 'http://localhost:9999/v1/' })
    expect(await s.resolve()).toMatchObject({ baseUrl: 'http://localhost:9999/v1', model: 'llama3.2:3b' })
    await s.set({ provider: 'openai', model: 'gpt-4o-mini', baseUrl: 'https://evil.example.com/v1' })
    expect((await s.resolve()).baseUrl).toBe('https://api.openai.com/v1')
  })

  it('rejects unknown providers and bad model names', async () => {
    const s = new AiSettingsStore(file)
    await expect(s.set({ provider: 'skynet' as never, model: 'x', baseUrl: '' })).rejects.toBeInstanceOf(SettingsError)
    await expect(s.set({ provider: 'openai', model: 'bad model!', baseUrl: '' })).rejects.toBeInstanceOf(SettingsError)
    await expect(s.set({ provider: 'openai', model: '../../etc', baseUrl: '' })).rejects.toBeInstanceOf(SettingsError)
  })

  it('falls back to defaults when the file is corrupt or has bad values', async () => {
    writeFileSync(file, '{not json')
    expect((await new AiSettingsStore(file).resolve()).provider.id).toBe('anthropic')
    writeFileSync(file, JSON.stringify({ provider: 'openai', models: { openai: 'bad model!' }, baseUrls: {} }))
    expect(await new AiSettingsStore(file).resolve()).toMatchObject({ model: 'gpt-4o-mini' })
    writeFileSync(file, JSON.stringify({ provider: 'unknown' }))
    expect((await new AiSettingsStore(file).resolve()).provider.id).toBe('anthropic')
  })

  it('does not apply a stored address that is no longer valid', async () => {
    writeFileSync(file, JSON.stringify({ provider: 'ollama', models: {}, baseUrls: { ollama: 'http://evil.example.com/v1' } }))
    expect((await new AiSettingsStore(file).resolve()).baseUrl).toBe('http://localhost:11434/v1')
  })
})

describe('validateBaseUrl / validateModel', () => {
  it('allows localhost over http and any host over https, and trims trailing slashes', () => {
    expect(validateBaseUrl('http://localhost:11434/v1')).toBe('http://localhost:11434/v1')
    expect(validateBaseUrl('http://127.0.0.1:1234/v1/')).toBe('http://127.0.0.1:1234/v1')
    expect(validateBaseUrl('https://llm.example.com/v1')).toBe('https://llm.example.com/v1')
  })

  it.each([
    ['not a url'],
    ['ftp://localhost/v1'],
    ['http://192.168.1.20:11434/v1'],
    ['http://example.com/v1'],
    ['http://localhost.evil.com/v1'],
    ['https://user:pass@example.com/v1'],
    ['https://example.com/v1?key=secret'],
    ['file:///C:/secret']
  ])('rejects %s', (url) => {
    expect(() => validateBaseUrl(url)).toThrow(SettingsError)
  })

  it('accepts real-world model names', () => {
    for (const m of ['gpt-4o-mini', 'claude-haiku-5-5', 'llama3.1:8b', 'openai/gpt-4o-mini', 'models/gemini-2.5-flash', 'mistral-small-latest']) {
      expect(validateModel(m)).toBe(m)
    }
    expect(() => validateModel('')).toThrow()
    expect(() => validateModel('a'.repeat(101))).toThrow()
  })
})

describe('explainWithAi across providers', () => {
  let dir: string
  let calls: Array<{ url: string; init: RequestInit }>
  let respond: (url: string) => Response
  let deps: AiServiceDeps
  const stores = new Map<ProviderId, KeyStore>()

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dirvo-multi-'))
    calls = []
    stores.clear()
    respond = () => new Response(JSON.stringify(wrap.openai(ANSWER)))
    deps = {
      settings: new AiSettingsStore(join(dir, 'settings.json')),
      keyStoreFor: (id) => {
        if (!stores.has(id)) stores.set(id, new KeyStore(join(dir, `${id}.bin`), enc, id))
        return stores.get(id) as KeyStore
      },
      cache: new AiCache(join(dir, 'cache.json')),
      usernames: () => ['jdoe'],
      fetchImpl: (async (url: string, init: RequestInit) => {
        calls.push({ url, init })
        return respond(url)
      }) as unknown as typeof fetch
    }
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('OpenAI: needs its own key, then returns a validated explanation', async () => {
    await deps.settings.set({ provider: 'openai', model: '', baseUrl: '' })
    expect(await explainWithAi(meta(), deps)).toEqual({ status: 'no-key' })
    await deps.keyStoreFor('openai').save('sk-proj-abcdefghijklmnopqrstuvwxyz')
    const r = await explainWithAi(meta(), deps)
    expect(r).toMatchObject({ status: 'ok', cached: false })
    expect(calls[0].url).toBe('https://api.openai.com/v1/chat/completions')
  })

  it('a key saved for one provider is never sent to another', async () => {
    await deps.keyStoreFor('anthropic').save('sk-ant-api03-abcdefghijklmnopqrstuvwxyz')
    await deps.settings.set({ provider: 'groq', model: '', baseUrl: '' })
    expect(await explainWithAi(meta(), deps)).toEqual({ status: 'no-key' })
    expect(calls).toHaveLength(0)
  })

  it('Gemini: parses its reply format', async () => {
    await deps.settings.set({ provider: 'gemini', model: '', baseUrl: '' })
    await deps.keyStoreFor('gemini').save('AIzaSyDUMMYKEYDUMMYKEY123456')
    respond = () => new Response(JSON.stringify(wrap.gemini(ANSWER)))
    const r = await explainWithAi(meta(), deps)
    expect(r).toMatchObject({ status: 'ok' })
    expect(JSON.stringify(calls[0].init.body)).not.toContain('AIzaSy')
  })

  it('Ollama: works with no key, and keeps data on this PC', async () => {
    await deps.settings.set({ provider: 'ollama', model: 'llama3.1', baseUrl: '' })
    const r = await explainWithAi(meta(), deps)
    expect(r).toMatchObject({ status: 'ok' })
    expect(new URL(calls[0].url).hostname).toBe('localhost')
    expect((calls[0].init.headers as Record<string, string>)).not.toHaveProperty('authorization')
  })

  it('the username is redacted for every provider', async () => {
    for (const id of ['openai', 'gemini', 'ollama'] as const) {
      calls = []
      await deps.settings.set({ provider: id, model: '', baseUrl: '' })
      if (id !== 'ollama') await deps.keyStoreFor(id).save('abcdefghijklmnopqrstuvwxyz123456')
      respond = () => new Response(JSON.stringify(id === 'gemini' ? wrap.gemini(ANSWER) : wrap.openai(ANSWER)))
      await explainWithAi(meta({ path: `C:\\Users\\jdoe\\AppData\\${id}\\X`, sampleFileNames: ['jdoe-notes.txt'] }), deps)
      expect(String(calls[0].init.body).toLowerCase(), id).not.toContain('jdoe')
    }
  })

  it('caches per provider and model: switching asks again, switching back does not', async () => {
    await deps.settings.set({ provider: 'ollama', model: 'llama3.1', baseUrl: '' })
    await explainWithAi(meta(), deps)
    await explainWithAi(meta(), deps)
    expect(calls).toHaveLength(1)
    await deps.settings.set({ provider: 'ollama', model: 'qwen2.5', baseUrl: '' })
    await explainWithAi(meta(), deps)
    expect(calls).toHaveLength(2)
    await deps.settings.set({ provider: 'ollama', model: 'llama3.1', baseUrl: '' })
    expect(await explainWithAi(meta(), deps)).toMatchObject({ cached: true })
    expect(calls).toHaveLength(2)
  })

  it('Ollama not running gives a helpful message', async () => {
    await deps.settings.set({ provider: 'ollama', model: 'llama3.1', baseUrl: '' })
    deps.fetchImpl = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    const r = await explainWithAi(meta(), deps)
    expect(r.status === 'error' && r.message).toMatch(/Ollama.*running/i)
  })

  it('a model that returns prose instead of JSON is discarded', async () => {
    await deps.settings.set({ provider: 'ollama', model: 'llama3.1', baseUrl: '' })
    respond = () => new Response(JSON.stringify(wrap.openai('Sure! This folder looks like a cache.')))
    expect((await explainWithAi(meta(), deps)).status).toBe('error')
  })

  it('low confidence is downgraded the same way for any provider', async () => {
    await deps.settings.set({ provider: 'ollama', model: 'llama3.1', baseUrl: '' })
    respond = () => new Response(JSON.stringify(wrap.openai(JSON.stringify({
      whatItIs: 'x', createdBy: 'y', verdict: 'SAFE', confidence: 'LOW', consequenceIfDeleted: 'z'
    }))))
    const r = await explainWithAi(meta(), deps)
    expect(r.status === 'ok' && r.explanation).toMatchObject({ verdict: 'CAUTION', downgradedFrom: 'SAFE' })
  })

  it('testApiKey works for keyless and keyed providers', async () => {
    await deps.settings.set({ provider: 'ollama', model: 'llama3.1', baseUrl: '' })
    expect((await testApiKey(deps)).ok).toBe(true)
    await deps.settings.set({ provider: 'openai', model: '', baseUrl: '' })
    expect(await testApiKey(deps)).toMatchObject({ ok: false, message: expect.stringMatching(/No API key/) })
    await deps.keyStoreFor('openai').save('sk-proj-abcdefghijklmnopqrstuvwxyz')
    respond = () => new Response('{}', { status: 401 })
    expect(await testApiKey(deps)).toMatchObject({ ok: false, message: expect.stringMatching(/rejected/) })
  })
})
