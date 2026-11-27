import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MAX_HISTORY_ENTRIES, MAX_SAVED_ITEMS, SavedScansStore, validateSavedScans } from '../src/main/storage/saved-scans'
import { explainPath } from '../src/main/knowledge/explain'
import type { FolderExplanation, SavedScans, ScannedFolder } from '../src/shared/types'
import { meta } from './helpers'

const NEVER: (p: string) => FolderExplanation | null = () => null
const ai: FolderExplanation = {
  whatItIs: 'Cache of Acme.',
  createdBy: 'Acme',
  verdict: 'REBUILDS_AUTOMATICALLY',
  confidence: 'HIGH',
  consequenceIfDeleted: 'Rebuilt later.',
  source: 'ai'
}

const item = (path: string, over: Partial<ScannedFolder> = {}): ScannedFolder => ({
  metadata: meta({ path, name: path.split('\\').pop() as string, sizeBytes: 1000 }),
  explanation: null,
  aiStatus: 'none',
  scannedAt: '2026-11-20T10:00:00.000Z',
  ...over
})

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dirvo-saved-'))
  file = join(dir, 'saved-scans.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('SavedScansStore', () => {
  it('saves results and size history and loads them back', async () => {
    const store = new SavedScansStore(file, NEVER)
    const saved: SavedScans = {
      items: [item('C:\\a\\Acme', { explanation: ai, previous: { sizeBytes: 500, scannedAt: '2026-11-01T00:00:00.000Z' }, lookedInside: { listed: 3, hiddenSmall: 1, skipped: 0 } })],
      history: { 'c:\\a\\acme': { sizeBytes: 1000, scannedAt: '2026-11-20T10:00:00.000Z' } }
    }
    await store.save(saved)
    const back = await new SavedScansStore(file, NEVER).load()
    expect(back.items).toHaveLength(1)
    expect(back.items[0]).toMatchObject({
      explanation: { source: 'ai', createdBy: 'Acme', verdict: 'REBUILDS_AUTOMATICALLY' },
      aiStatus: 'none',
      scannedAt: '2026-11-20T10:00:00.000Z',
      previous: { sizeBytes: 500 },
      lookedInside: { listed: 3, hiddenSmall: 1, skipped: 0 }
    })
    expect(back.items[0].metadata.sizeBytes).toBe(1000)
    expect(back.history['c:\\a\\acme']).toEqual({ sizeBytes: 1000, scannedAt: '2026-11-20T10:00:00.000Z' })
  })

  it('keeps the unreadable and link counts the scanner found', async () => {
    const m = item('C:\\a\\x')
    m.metadata.unreadableCount = 4
    m.metadata.linksSkipped = 2
    await new SavedScansStore(file, NEVER).save({ items: [m], history: {} })
    const back = await new SavedScansStore(file, NEVER).load()
    expect(back.items[0].metadata).toMatchObject({ unreadableCount: 4, linksSkipped: 2 })
  })

  it('writes only AI answers to disk; offline rulings are recomputed on load', async () => {
    const store = new SavedScansStore(file, (p) => explainPath(p))
    const known = item('C:\\Users\\a\\AppData\\Local\\npm-cache')
    known.explanation = { ...ai, source: 'database', whatItIs: 'STALE TEXT THAT MUST NOT BE REUSED', verdict: 'DONT_TOUCH' }
    await store.save({ items: [known], history: {} })
    expect(readFileSync(file, 'utf8')).not.toContain('STALE TEXT')
    const back = await new SavedScansStore(file, (p) => explainPath(p)).load()
    expect(back.items[0].explanation).toMatchObject({ source: 'database', matchedId: 'npm-cache', verdict: 'REBUILDS_AUTOMATICALLY' })
  })

  it('applies an improved database to old results', async () => {
    writeFileSync(file, JSON.stringify({ items: [{ metadata: item('C:\\x\\mystery').metadata, explanation: null, scannedAt: '2026-11-20T10:00:00.000Z' }], history: {} }))
    const updated = (p: string): FolderExplanation | null => (p.endsWith('mystery') ? { ...ai, source: 'database', createdBy: 'Now known' } : null)
    const back = await new SavedScansStore(file, updated).load()
    expect(back.items[0].explanation?.createdBy).toBe('Now known')
  })

  it('lets the database win over an old AI answer, and keeps the AI answer when the database knows nothing', async () => {
    const withAi = item('C:\\x\\thing', { explanation: ai })
    writeFileSync(file, JSON.stringify({ items: [{ metadata: withAi.metadata, explanation: ai, scannedAt: withAi.scannedAt }], history: {} }))
    expect((await new SavedScansStore(file, NEVER).load()).items[0].explanation?.source).toBe('ai')
    const db = (): FolderExplanation => ({ ...ai, source: 'database', createdBy: 'DB' })
    expect((await new SavedScansStore(file, db).load()).items[0].explanation).toMatchObject({ source: 'database', createdBy: 'DB' })
  })

  it('starts empty when the file is missing or corrupt', async () => {
    expect(await new SavedScansStore(file, NEVER).load()).toEqual({ items: [], history: {} })
    writeFileSync(file, '{not json')
    expect(await new SavedScansStore(file, NEVER).load()).toEqual({ items: [], history: {} })
  })

  it('clear deletes the file, and is fine when there is none', async () => {
    const store = new SavedScansStore(file, NEVER)
    await store.save({ items: [item('C:\\a\\x')], history: {} })
    expect(existsSync(file)).toBe(true)
    await store.clear()
    expect(existsSync(file)).toBe(false)
    await expect(store.clear()).resolves.toBeUndefined()
  })

  it('handles several saves in a row without corrupting the file', async () => {
    const store = new SavedScansStore(file, NEVER)
    await Promise.all(Array.from({ length: 10 }, (_, i) => store.save({ items: [item(`C:\\a\\f${i}`)], history: {} })))
    const back = await store.load()
    expect(back.items).toHaveLength(1)
    expect(existsSync(`${file}.tmp`)).toBe(false)
  })
})

describe('validateSavedScans (the file may have been edited or damaged)', () => {
  const good = (path = 'C:\\a\\ok'): unknown => ({ metadata: item(path).metadata, explanation: null, scannedAt: '2026-11-20T10:00:00.000Z' })

  it('returns nothing for non-objects', () => {
    for (const bad of [null, 5, 'x', [], undefined]) expect(validateSavedScans(bad, NEVER)).toEqual({ items: [], history: {} })
  })

  it('drops bad items and keeps good ones', () => {
    const r = validateSavedScans(
      {
        items: [
          good('C:\\a\\one'),
          null,
          'junk',
          { metadata: { path: 'C:\\x' }, scannedAt: '2026-11-20T10:00:00.000Z' }, // incomplete metadata
          { ...(good('C:\\a\\bad-date') as object), scannedAt: 'yesterday' },
          { ...(good('C:\\a\\neg') as { metadata: object }), metadata: { ...item('C:\\a\\neg').metadata, sizeBytes: -5 }, scannedAt: '2026-11-20T10:00:00.000Z' },
          good('C:\\a\\two')
        ]
      },
      NEVER
    )
    expect(r.items.map((i) => i.metadata.name)).toEqual(['one', 'two'])
  })

  it('removes duplicate paths, ignoring case', () => {
    const r = validateSavedScans({ items: [good('C:\\a\\Dup'), good('c:\\A\\dup')] }, NEVER)
    expect(r.items).toHaveLength(1)
  })

  it('ignores a made-up verdict or a database-looking answer from the file', () => {
    const entry = { ...(good() as object), explanation: { ...ai, verdict: 'DELETE_EVERYTHING' } }
    expect(validateSavedScans({ items: [entry] }, NEVER).items[0].explanation).toBeNull()
    const claimsDb = { ...(good() as object), explanation: { ...ai, source: 'database' } }
    expect(validateSavedScans({ items: [claimsDb] }, NEVER).items[0].explanation).toBeNull()
    const claimsSystem = { ...(good() as object), explanation: { ...ai, source: 'system', verdict: 'SAFE' } }
    expect(validateSavedScans({ items: [claimsSystem] }, NEVER).items[0].explanation).toBeNull()
  })

  it('truncates overlong AI text and strips unknown fields', () => {
    const entry = { ...(good() as object), explanation: { ...ai, whatItIs: 'x'.repeat(5000), evil: '<script>' } }
    const e = validateSavedScans({ items: [entry] }, NEVER).items[0].explanation
    expect(e?.whatItIs).toHaveLength(600)
    expect(e).not.toHaveProperty('evil')
  })

  it('never restores a loading or error state', () => {
    const entry = { ...(good() as object), aiStatus: 'loading', aiError: 'boom' }
    expect(validateSavedScans({ items: [entry] }, NEVER).items[0]).toMatchObject({ aiStatus: 'none' })
    expect(validateSavedScans({ items: [entry] }, NEVER).items[0]).not.toHaveProperty('aiError')
  })

  it('caps how many items and history entries are read', () => {
    const items = Array.from({ length: MAX_SAVED_ITEMS + 50 }, (_, i) => good(`C:\\a\\f${i}`))
    expect(validateSavedScans({ items }, NEVER).items).toHaveLength(MAX_SAVED_ITEMS)
    const history = Object.fromEntries(Array.from({ length: MAX_HISTORY_ENTRIES + 50 }, (_, i) => [`c:\\a\\f${i}`, { sizeBytes: 1, scannedAt: '2026-11-20T10:00:00.000Z' }]))
    expect(Object.keys(validateSavedScans({ history }, NEVER).history)).toHaveLength(MAX_HISTORY_ENTRIES)
  })

  it('validates history entries', () => {
    const r = validateSavedScans(
      {
        history: {
          'c:\\ok': { sizeBytes: 10, scannedAt: '2026-11-20T10:00:00.000Z' },
          'c:\\neg': { sizeBytes: -1, scannedAt: '2026-11-20T10:00:00.000Z' },
          'c:\\bad-date': { sizeBytes: 1, scannedAt: 'later' },
          'c:\\string-size': { sizeBytes: '5', scannedAt: '2026-11-20T10:00:00.000Z' },
          '': { sizeBytes: 1, scannedAt: '2026-11-20T10:00:00.000Z' }
        }
      },
      NEVER
    )
    expect(Object.keys(r.history)).toEqual(['c:\\ok'])
  })

  it('ignores a malformed previous or lookedInside instead of failing the item', () => {
    const entry = { ...(good() as object), previous: { sizeBytes: 'big' }, lookedInside: { listed: 'many' } }
    const i = validateSavedScans({ items: [entry] }, NEVER).items[0]
    expect(i).not.toHaveProperty('previous')
    expect(i).not.toHaveProperty('lookedInside')
  })
})
