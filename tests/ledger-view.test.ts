import { describe, expect, it } from 'vitest'
import { DEFAULT_VIEW, applyView, compareFor, filterOf, matchesQuery, type LedgerView } from '../src/renderer/src/lib/ledger-view'
import type { ScannedFolder, Verdict } from '../src/shared/types'
import { meta } from './helpers'

const GB = 1024 ** 3

const item = (
  path: string,
  size: number,
  verdict: Verdict | null,
  over: { createdBy?: string; newest?: string | null; modified?: string | null } = {}
): ScannedFolder => ({
  metadata: meta({
    path,
    name: path.split('\\').pop() as string,
    sizeBytes: size,
    newestFileAt: over.newest === undefined ? '2024-01-01T00:00:00.000Z' : over.newest,
    modifiedAt: over.modified === undefined ? '2024-01-01T00:00:00.000Z' : over.modified
  }),
  explanation: verdict
    ? { whatItIs: 'x', createdBy: over.createdBy ?? 'Someone', verdict, confidence: 'HIGH', consequenceIfDeleted: 'z', source: 'database' }
    : null,
  aiStatus: 'none',
  scannedAt: '2026-11-20T10:00:00.000Z'
})

const sample = [
  item('C:\\a\\Temp', 22 * GB, 'SAFE', { createdBy: 'Windows', newest: '2026-11-20T00:00:00.000Z' }),
  item('C:\\a\\npm-cache', 8 * GB, 'REBUILDS_AUTOMATICALLY', { createdBy: 'npm', newest: '2026-01-05T00:00:00.000Z' }),
  item('C:\\a\\.gradle', 10 * GB, 'CAUTION', { createdBy: 'Gradle', newest: '2025-06-01T00:00:00.000Z' }),
  item('C:\\Windows\\WinSxS', 17 * GB, 'DONT_TOUCH', { createdBy: 'Windows', newest: '2026-11-25T00:00:00.000Z' }),
  item('C:\\a\\Mystery', 5 * GB, null, { newest: null, modified: null })
]

const view = (over: Partial<LedgerView> = {}): LedgerView => ({ ...DEFAULT_VIEW, ...over })
const names = (items: ScannedFolder[], v: LedgerView): string[] => applyView(items, v).rows.map((r) => r.item.metadata.name)

describe('filterOf', () => {
  it('puts Safe and Rebuilds together as reclaimable, and anything without an answer under unknown', () => {
    expect(filterOf(sample[0])).toBe('RECLAIMABLE')
    expect(filterOf(sample[1])).toBe('RECLAIMABLE')
    expect(filterOf(sample[2])).toBe('CAUTION')
    expect(filterOf(sample[3])).toBe('DONT_TOUCH')
    expect(filterOf(sample[4])).toBe('UNKNOWN')
  })
})

describe('matchesQuery', () => {
  it('matches the name, the path, or who made it, in any case', () => {
    expect(matchesQuery(sample[0], 'TEMP')).toBe(true)
    expect(matchesQuery(sample[1], 'npm')).toBe(true) // name and maker
    expect(matchesQuery(sample[3], 'windows')).toBe(true) // path and maker
    expect(matchesQuery(sample[2], 'gradle')).toBe(true)
    expect(matchesQuery(sample[0], 'nothing-like-this')).toBe(false)
  })

  it('needs every word to match', () => {
    expect(matchesQuery(sample[3], 'windows winsxs')).toBe(true)
    expect(matchesQuery(sample[3], 'windows gradle')).toBe(false)
    expect(matchesQuery(sample[3], '  windows   ')).toBe(true)
  })

  it('treats an empty or blank search as matching everything', () => {
    expect(matchesQuery(sample[0], '')).toBe(true)
    expect(matchesQuery(sample[0], '   ')).toBe(true)
  })

  it('is not fooled by regex characters', () => {
    expect(matchesQuery(sample[1], '.*')).toBe(false)
    expect(matchesQuery(sample[2], '.gradle')).toBe(true)
  })
})

describe('sorting', () => {
  it('sorts by size either way', () => {
    expect(names(sample, view({ sort: 'size-desc' }))).toEqual(['Temp', 'WinSxS', '.gradle', 'npm-cache', 'Mystery'])
    expect(names(sample, view({ sort: 'size-asc' }))).toEqual(['Mystery', 'npm-cache', '.gradle', 'WinSxS', 'Temp'])
  })

  it('sorts by name, ignoring case and treating numbers naturally', () => {
    const list = [item('C:\\v10', 1, null), item('C:\\v2', 1, null), item('C:\\Alpha', 1, null), item('C:\\beta', 1, null)]
    expect(names(list, view({ sort: 'name' }))).toEqual(['Alpha', 'beta', 'v2', 'v10'])
  })

  it('sorts by last activity, and always puts folders with no date last', () => {
    expect(names(sample, view({ sort: 'untouched' }))).toEqual(['.gradle', 'npm-cache', 'Temp', 'WinSxS', 'Mystery'])
    expect(names(sample, view({ sort: 'recent' }))).toEqual(['WinSxS', 'Temp', 'npm-cache', '.gradle', 'Mystery'])
  })

  it('falls back to the folder date when it has no files', () => {
    const empty = item('C:\\a\\empty', 0, null, { newest: null, modified: '2020-01-01T00:00:00.000Z' })
    expect(names([...sample, empty], view({ sort: 'untouched' }))[0]).toBe('empty')
  })

  it('is stable for equal values', () => {
    const cmp = compareFor('size-desc')
    expect(cmp(item('C:\\a', GB, null), item('C:\\b', GB, null))).toBe(0)
  })
})

describe('applyView', () => {
  it('by default shows everything as the indented tree', () => {
    const tree = [item('C:\\a\\Google', 93 * GB, null), item('C:\\a\\Google\\Chrome', 7 * GB, 'DONT_TOUCH'), item('C:\\b\\other', 5 * GB, 'SAFE')]
    const r = applyView(tree, DEFAULT_VIEW)
    expect(r.filtering).toBe(false)
    expect(r.rows.map((x) => `${x.depth}:${x.item.metadata.name}`)).toEqual(['0:Google', '1:Chrome', '0:other'])
    expect(r.matched).toBe(3)
  })

  it('applies the chosen sort to the tree at every level', () => {
    const tree = [item('C:\\a\\Google', 93 * GB, null), item('C:\\a\\Google\\Zed', 9 * GB, null), item('C:\\a\\Google\\Alpha', 1 * GB, null), item('C:\\a\\Beta', 5 * GB, null)]
    const r = applyView(tree, view({ sort: 'name' }))
    expect(r.rows.map((x) => `${x.depth}:${x.item.metadata.name}`)).toEqual(['0:Beta', '0:Google', '1:Alpha', '1:Zed'])
  })

  it('flattens the list while searching or filtering', () => {
    const tree = [item('C:\\a\\Google', 93 * GB, null), item('C:\\a\\Google\\Chrome', 7 * GB, 'DONT_TOUCH')]
    const r = applyView(tree, view({ query: 'chrome' }))
    expect(r.filtering).toBe(true)
    expect(r.rows.map((x) => x.depth)).toEqual([0])
    expect(r.matched).toBe(1)
    expect(r.total).toBe(2)
  })

  it('filters by chip', () => {
    expect(names(sample, view({ filter: 'RECLAIMABLE' }))).toEqual(['Temp', 'npm-cache'])
    expect(names(sample, view({ filter: 'CAUTION' }))).toEqual(['.gradle'])
    expect(names(sample, view({ filter: 'DONT_TOUCH' }))).toEqual(['WinSxS'])
    expect(names(sample, view({ filter: 'UNKNOWN' }))).toEqual(['Mystery'])
  })

  it('combines search, filter and sort', () => {
    expect(names(sample, view({ query: 'windows', filter: 'RECLAIMABLE' }))).toEqual(['Temp'])
    expect(names(sample, view({ filter: 'RECLAIMABLE', sort: 'size-asc' }))).toEqual(['npm-cache', 'Temp'])
  })

  it('counts each chip against the current search, not the whole list', () => {
    const all = applyView(sample, DEFAULT_VIEW).counts
    expect(all).toEqual({ ALL: 5, RECLAIMABLE: 2, CAUTION: 1, DONT_TOUCH: 1, UNKNOWN: 1 })
    const windows = applyView(sample, view({ query: 'windows' })).counts
    expect(windows).toEqual({ ALL: 2, RECLAIMABLE: 1, CAUTION: 0, DONT_TOUCH: 1, UNKNOWN: 0 })
  })

  it('returns an empty list, not an error, when nothing matches', () => {
    const r = applyView(sample, view({ query: 'zzz' }))
    expect(r.rows).toEqual([])
    expect(r.matched).toBe(0)
    expect(r.total).toBe(5)
  })

  it('does not change the list it is given', () => {
    const copy = [...sample]
    applyView(sample, view({ query: 'a', filter: 'RECLAIMABLE', sort: 'name' }))
    expect(sample).toEqual(copy)
  })

  it('handles no results at all', () => {
    expect(applyView([], DEFAULT_VIEW)).toMatchObject({ rows: [], matched: 0, total: 0, filtering: false })
  })
})

describe('idle filter', () => {
  const NOW = Date.parse('2026-11-26T12:00:00.000Z')
  // sample ages: Temp 6 days, npm-cache about 11 months, .gradle about 18 months, WinSxS 1 day, Mystery unknown
  const idleNames = (v: Partial<LedgerView>): string[] => applyView(sample, view(v), NOW).rows.map((r) => r.item.metadata.name)

  it('shows only folders untouched for a year or more', () => {
    expect(idleNames({ idleOnly: true })).toEqual(['.gradle'])
  })

  it('counts them for the chip, whatever else is filtered', () => {
    expect(applyView(sample, DEFAULT_VIEW, NOW).idleCount).toBe(1)
    expect(applyView(sample, view({ filter: 'RECLAIMABLE' }), NOW).idleCount).toBe(1)
    expect(applyView(sample, view({ query: 'temp' }), NOW).idleCount).toBe(0)
  })

  it('combines with the ruling filter and the search', () => {
    expect(idleNames({ idleOnly: true, filter: 'CAUTION' })).toEqual(['.gradle'])
    expect(idleNames({ idleOnly: true, filter: 'RECLAIMABLE' })).toEqual([])
    expect(idleNames({ idleOnly: true, query: 'gradle' })).toEqual(['.gradle'])
    expect(idleNames({ idleOnly: true, query: 'windows' })).toEqual([])
  })

  it('counts as filtering, so the list is flat', () => {
    const r = applyView(sample, view({ idleOnly: true }), NOW)
    expect(r.filtering).toBe(true)
    expect(r.rows.every((x) => x.depth === 0)).toBe(true)
    expect(r.matched).toBe(1)
    expect(r.total).toBe(5)
  })

  it('never treats a folder with no known date as idle', () => {
    expect(idleNames({ idleOnly: true })).not.toContain('Mystery')
  })
})
