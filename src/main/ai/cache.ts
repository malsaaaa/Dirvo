import { createHash } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import { dirname } from 'node:path'
import type { AiAnswer } from './validate'

interface CacheEntry {
  answer: AiAnswer
  storedAt: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Cache key: the redacted path (so it is identical across Windows accounts), the prompt version, and
 * which provider and model answered (so switching models asks again instead of reusing old answers).
 */
export function cacheKey(redactedPath: string, promptVersion: number, providerAndModel = ''): string {
  return createHash('sha256')
    .update(`v${promptVersion}|${providerAndModel.toLowerCase()}|${redactedPath.toLowerCase()}`)
    .digest('hex')
}

/**
 * Local JSON cache of validated AI answers (before the confidence policy is applied, so policy
 * changes take effect immediately). Holds no API key and no raw username.
 */
export class AiCache {
  private entries: Map<string, CacheEntry> | null = null
  private writing: Promise<void> = Promise.resolve()

  constructor(
    private readonly filePath: string,
    private readonly opts: { ttlMs?: number; maxEntries?: number; now?: () => number } = {}
  ) {}

  private now(): number {
    return (this.opts.now ?? Date.now)()
  }

  private async load(): Promise<Map<string, CacheEntry>> {
    if (this.entries) return this.entries
    this.entries = new Map()
    try {
      const parsed: unknown = JSON.parse(await fsp.readFile(this.filePath, 'utf8'))
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed as Record<string, CacheEntry>)) {
          if (v && typeof v.storedAt === 'number' && v.answer) this.entries.set(k, v)
        }
      }
    } catch {
      // Missing or corrupt cache file: start empty.
    }
    return this.entries
  }

  async get(key: string): Promise<AiAnswer | null> {
    const entries = await this.load()
    const hit = entries.get(key)
    if (!hit) return null
    if (this.now() - hit.storedAt > (this.opts.ttlMs ?? 30 * DAY_MS)) {
      entries.delete(key)
      return null
    }
    return hit.answer
  }

  async set(key: string, answer: AiAnswer): Promise<void> {
    const entries = await this.load()
    entries.set(key, { answer, storedAt: this.now() })
    const max = this.opts.maxEntries ?? 500
    if (entries.size > max) {
      const oldest = [...entries.entries()].sort((a, b) => a[1].storedAt - b[1].storedAt)
      for (const [k] of oldest.slice(0, entries.size - max)) entries.delete(k)
    }
    await this.flush()
  }

  async clear(): Promise<void> {
    this.entries = new Map()
    await this.flush()
  }

  private flush(): Promise<void> {
    const snapshot = JSON.stringify(Object.fromEntries(this.entries ?? []))
    // Serialise writes; write to a temp file and rename so a crash cannot leave a half-written cache.
    this.writing = this.writing.then(async () => {
      try {
        await fsp.mkdir(dirname(this.filePath), { recursive: true })
        const tmp = `${this.filePath}.tmp`
        await fsp.writeFile(tmp, snapshot)
        await fsp.rename(tmp, this.filePath)
      } catch {
        // A failed cache write must never break an explanation.
      }
    })
    return this.writing
  }
}
