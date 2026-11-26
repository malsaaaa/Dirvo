import { describe, expect, it } from 'vitest'
import { MAX_HISTORY, MIN_CHANGE_BYTES, changesSince, deltaOf, recordScan, scanSpan, type History } from '../src/renderer/src/lib/history'
import { formatDateTime, formatDelta } from '../src/renderer/src/lib/format'
import type { ScannedFolder, SizeSnapshot } from '../src/shared/types'
import { meta } from './helpers'

const MB = 1024 * 1024
const GB = 1024 * MB

const item = (path: string, size: number, previous?: SizeSnapshot, scannedAt = '2026-11-26T10:00:00.000Z'): ScannedFolder => ({
  metadata: meta({ path, name: path.split('\\').pop() as string, sizeBytes: size }),
  explanation: null,
  aiStatus: 'none',
  scannedAt,
  ...(previous ? { previous } : {})
})
const snap = (sizeBytes: number, scannedAt = '2026-11-12T10:00:00.000Z'): SizeSnapshot => ({ sizeBytes, scannedAt })

describe('recordScan', () => {
  it('has no previous size the first time, and remembers the size', () => {
    const r = recordScan({}, 'C:\\a\\Temp', 5 * GB, '2026-11-12T10:00:00.000Z')
    expect(r.previous).toBeUndefined()
    expect(r.history['c:\\a\\temp']).toEqual({ sizeBytes: 5 * GB, scannedAt: '2026-11-12T10:00:00.000Z' })
  })

  it('returns the earlier size on a later scan, whatever the case or slashes', () => {
    const first = recordScan({}, 'C:\\a\\Temp', 5 * GB, '2026-11-12T10:00:00.000Z')
    const second = recordScan(first.history, 'c:/A/temp/', 8 * GB, '2026-11-26T10:00:00.000Z')
    expect(second.previous).toEqual({ sizeBytes: 5 * GB, scannedAt: '2026-11-12T10:00:00.000Z' })
    expect(second.history['c:\\a\\temp'].sizeBytes).toBe(8 * GB)
  })

  it('does not count the same scan twice as a change', () => {
    const first = recordScan({}, 'C:\\a\\x', 5 * GB, '2026-11-12T10:00:00.000Z')
    expect(recordScan(first.history, 'C:\\a\\x', 5 * GB, '2026-11-12T10:00:00.000Z').previous).toBeUndefined()
  })

  it('never changes the history it is given', () => {
    const h: History = { 'c:\\a': snap(1) }
    const copy = JSON.parse(JSON.stringify(h))
    recordScan(h, 'C:\\b', 2, '2026-11-26T10:00:00.000Z')
    expect(h).toEqual(copy)
  })

  it('drops the oldest entries when the history is full', () => {
    const h: History = {}
    for (let i = 0; i < MAX_HISTORY; i++) h['c:\\old' + i] = snap(1, new Date(2020, 0, 1, 0, 0, i).toISOString())
    const r = recordScan(h, 'C:\\new', 1, '2026-11-26T10:00:00.000Z')
    expect(Object.keys(r.history)).toHaveLength(MAX_HISTORY)
    expect(r.history['c:\\new']).toBeDefined()
    expect(r.history['c:\\old0']).toBeUndefined() // the oldest went
    expect(r.history['c:\\old1']).toBeDefined()
  })
})

describe('deltaOf', () => {
  it('reports growth and shrinkage with the date compared against', () => {
    expect(deltaOf(item('C:\\a', 8 * GB, snap(5 * GB)))).toEqual({ bytes: 3 * GB, since: '2026-11-12T10:00:00.000Z' })
    expect(deltaOf(item('C:\\a', 2 * GB, snap(5 * GB)))?.bytes).toBe(-3 * GB)
  })

  it('ignores a first scan and changes under the noise limit', () => {
    expect(deltaOf(item('C:\\a', 5 * GB))).toBeNull()
    expect(deltaOf(item('C:\\a', 5 * GB + MIN_CHANGE_BYTES - 1, snap(5 * GB)))).toBeNull()
    expect(deltaOf(item('C:\\a', 5 * GB + MIN_CHANGE_BYTES, snap(5 * GB)))).not.toBeNull()
  })
})

describe('changesSince', () => {
  it('adds up the net change over folders that were scanned before', () => {
    const c = changesSince([
      item('C:\\a\\x', 8 * GB, snap(5 * GB)),
      item('C:\\a\\y', 1 * GB, snap(3 * GB, '2026-11-05T10:00:00.000Z')),
      item('C:\\a\\fresh', 9 * GB) // first scan: not part of the comparison
    ])
    expect(c).toEqual({ bytes: 1 * GB, changed: 2, since: '2026-11-05T10:00:00.000Z' })
  })

  it('does not count a folder twice when it contains another result', () => {
    const c = changesSince([item('C:\\a\\Google', 10 * GB, snap(6 * GB)), item('C:\\a\\Google\\Chrome', 4 * GB, snap(1 * GB))])
    expect(c?.bytes).toBe(4 * GB)
  })

  it('is null when nothing was scanned before, or nothing really changed', () => {
    expect(changesSince([item('C:\\a', 1)])).toBeNull()
    expect(changesSince([])).toBeNull()
    expect(changesSince([item('C:\\a', 5 * GB, snap(5 * GB))])).toBeNull()
  })

  it('shows a net change of zero as nothing, even if folders moved in opposite directions', () => {
    expect(changesSince([item('C:\\a', 6 * GB, snap(5 * GB)), item('C:\\b', 4 * GB, snap(5 * GB))])).toBeNull()
  })
})

describe('scanSpan', () => {
  it('finds the first and last scan dates', () => {
    expect(
      scanSpan([
        item('C:\\a', 1, undefined, '2026-11-20T10:00:00.000Z'),
        item('C:\\b', 1, undefined, '2026-11-12T10:00:00.000Z'),
        item('C:\\c', 1, undefined, '2026-11-26T10:00:00.000Z')
      ])
    ).toEqual({ first: '2026-11-12T10:00:00.000Z', last: '2026-11-26T10:00:00.000Z' })
    expect(scanSpan([])).toBeNull()
  })
})

describe('formatting', () => {
  it('formats a change with a sign', () => {
    expect(formatDelta(3 * GB)).toBe('+3.0 GB')
    expect(formatDelta(-300 * MB)).toBe('−300 MB')
    expect(formatDelta(0)).toBe('+0 B')
  })

  it('shows the year only when it is not the current one', () => {
    const now = new Date(2026, 10, 26)
    expect(formatDateTime(new Date(2026, 10, 20, 14, 5).toISOString(), now)).not.toMatch(/2026/)
    expect(formatDateTime(new Date(2025, 10, 20, 14, 5).toISOString(), now)).toMatch(/2025/)
    expect(formatDateTime(null)).toBe('Unknown')
    expect(formatDateTime('nope')).toBe('Unknown')
  })
})
