import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AiCache, cacheKey } from '../src/main/ai/cache'
import { EncryptionUnavailableError, KeyFormatError, KeyStore, normalizeKey, type Encryptor } from '../src/main/ai/key-store'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dirvo-ai-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** Fake "encryption": reverses the bytes. Enough to prove plaintext is not what gets written. */
const fakeEncryptor = (available = true): Encryptor => ({
  isEncryptionAvailable: () => available,
  encryptString: (s) => Buffer.from(s, 'utf8').reverse(),
  decryptString: (b) => Buffer.from(b).reverse().toString('utf8')
})

const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789'

describe('KeyStore', () => {
  it('round-trips a key without writing it in plain text', async () => {
    const file = join(dir, 'key.bin')
    const store = new KeyStore(file, fakeEncryptor())
    expect(await store.hasKey()).toBe(false)
    await store.save(`  ${KEY}\n`)
    expect(await store.hasKey()).toBe(true)
    expect(await store.load()).toBe(KEY)
    expect(readFileSync(file).toString('utf8')).not.toContain(KEY)
  })

  it('refuses to store anything when encryption is unavailable', async () => {
    const file = join(dir, 'key.bin')
    const store = new KeyStore(file, fakeEncryptor(false))
    await expect(store.save(KEY)).rejects.toBeInstanceOf(EncryptionUnavailableError)
    expect(existsSync(file)).toBe(false)
  })

  it('rejects malformed keys', async () => {
    const store = new KeyStore(join(dir, 'key.bin'), fakeEncryptor())
    await expect(store.save('hello')).rejects.toBeInstanceOf(KeyFormatError)
    await expect(store.save('sk-ant-short')).rejects.toBeInstanceOf(KeyFormatError)
    expect(() => normalizeKey('sk-ant-' + 'a b'.repeat(10))).toThrow(KeyFormatError)
  })

  it('removes the key', async () => {
    const store = new KeyStore(join(dir, 'key.bin'), fakeEncryptor())
    await store.save(KEY)
    await store.remove()
    expect(await store.hasKey()).toBe(false)
    await expect(store.remove()).resolves.toBeUndefined()
  })

  it('returns null instead of throwing when the stored data cannot be decrypted', async () => {
    const file = join(dir, 'key.bin')
    writeFileSync(file, 'garbage')
    const broken: Encryptor = { ...fakeEncryptor(), decryptString: () => { throw new Error('bad') } }
    expect(await new KeyStore(file, broken).load()).toBeNull()
  })
})

describe('AiCache', () => {
  const answer = {
    whatItIs: 'x',
    createdBy: 'y',
    verdict: 'SAFE' as const,
    confidence: 'HIGH' as const,
    consequenceIfDeleted: 'z'
  }

  it('stores, returns and persists answers across instances', async () => {
    const file = join(dir, 'cache.json')
    await new AiCache(file).set('k1', answer)
    expect(await new AiCache(file).get('k1')).toEqual(answer)
    expect(await new AiCache(file).get('other')).toBeNull()
  })

  it('expires old entries', async () => {
    let now = 1_000
    const cache = new AiCache(join(dir, 'c.json'), { ttlMs: 100, now: () => now })
    await cache.set('k', answer)
    now = 1_050
    expect(await cache.get('k')).toEqual(answer)
    now = 1_200
    expect(await cache.get('k')).toBeNull()
  })

  it('evicts the oldest entries beyond the limit', async () => {
    let now = 0
    const cache = new AiCache(join(dir, 'c.json'), { maxEntries: 2, now: () => ++now })
    await cache.set('a', answer)
    await cache.set('b', answer)
    await cache.set('c', answer)
    expect(await cache.get('a')).toBeNull()
    expect(await cache.get('b')).toEqual(answer)
    expect(await cache.get('c')).toEqual(answer)
  })

  it('survives a corrupt cache file', async () => {
    const file = join(dir, 'c.json')
    writeFileSync(file, '{not json')
    const cache = new AiCache(file)
    expect(await cache.get('x')).toBeNull()
    await cache.set('x', answer)
    expect(await new AiCache(file).get('x')).toEqual(answer)
  })

  it('never stores keys or usernames: only the answer and a hashed key', async () => {
    const file = join(dir, 'c.json')
    await new AiCache(file).set(cacheKey('C:\\Users\\<USER>\\x', 1), answer)
    const text = readFileSync(file, 'utf8')
    expect(text).not.toContain('Users')
    expect(text).not.toContain('sk-ant')
  })
})

describe('cacheKey', () => {
  it('ignores case and changes with the prompt version', () => {
    expect(cacheKey('C:\\A\\B', 1)).toBe(cacheKey('c:\\a\\b', 1))
    expect(cacheKey('C:\\A\\B', 1)).not.toBe(cacheKey('C:\\A\\B', 2))
  })
})
