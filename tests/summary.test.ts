import { describe, expect, it } from 'vitest'
import { summarize } from '../src/renderer/src/lib/summary'
import { buildForest, flattenLedger, normPath } from '../src/renderer/src/lib/tree'
import type { ScannedFolder, Verdict } from '../src/shared/types'
import { meta } from './helpers'

const GB = 1024 ** 3

const item = (path: string, size: number, verdict: Verdict | null): ScannedFolder => ({
  metadata: meta({ path, name: path.split('\\').pop() as string, sizeBytes: size }),
  explanation: verdict
    ? { whatItIs: 'x', createdBy: 'y', verdict, confidence: 'HIGH', consequenceIfDeleted: 'z', source: 'database' }
    : null,
  aiStatus: 'none',
  scannedAt: '2026-11-20T10:00:00.000Z'
})

describe('summarize', () => {
  it('adds Safe and Rebuilds together as reclaimable, and splits every total by verdict', () => {
    const s = summarize([
      item('C:\\a\\temp', 22 * GB, 'SAFE'),
      item('C:\\a\\npm-cache', 8 * GB, 'REBUILDS_AUTOMATICALLY'),
      item('C:\\a\\.gradle', 10 * GB, 'CAUTION'),
      item('C:\\Windows\\WinSxS', 17 * GB, 'DONT_TOUCH'),
      item('C:\\a\\mystery', 5 * GB, null)
    ])
    expect(s.reclaimableBytes).toBe(30 * GB)
    expect(s.reclaimableCount).toBe(2)
    expect(s.totalBytes).toBe(62 * GB)
    expect(s.count).toBe(5)
    expect(s.byBucket.SAFE).toEqual({ bytes: 22 * GB, count: 1 })
    expect(s.byBucket.CAUTION.bytes).toBe(10 * GB)
    expect(s.byBucket.DONT_TOUCH.bytes).toBe(17 * GB)
    expect(s.byBucket.UNKNOWN).toEqual({ bytes: 5 * GB, count: 1 })
  })

  it('never counts the same space twice when one result is inside another', () => {
    const s = summarize([
      item('C:\\Users\\a\\AppData\\Local\\Temp', 22 * GB, 'SAFE'),
      item('C:\\Users\\a\\AppData\\Local\\Temp\\build-cache', 3 * GB, 'SAFE'),
      item('C:\\Users\\a\\AppData\\Local\\Temp\\build-cache\\deep', 1 * GB, 'SAFE')
    ])
    expect(s.totalBytes).toBe(22 * GB)
    expect(s.reclaimableBytes).toBe(22 * GB)
  })

  it('splits a folder between its own verdict and what was found inside it', () => {
    // Looking inside a 93 GB unknown folder found a 20 GB rebuildable cache and a 10 GB careful folder.
    const s = summarize([
      item('C:\\Users\\a\\AppData\\Local\\Google', 93 * GB, null),
      item('C:\\Users\\a\\AppData\\Local\\Google\\Chrome\\Cache', 20 * GB, 'REBUILDS_AUTOMATICALLY'),
      item('C:\\Users\\a\\AppData\\Local\\Google\\Android', 10 * GB, 'CAUTION')
    ])
    expect(s.totalBytes).toBe(93 * GB)
    expect(s.reclaimableBytes).toBe(20 * GB)
    expect(s.byBucket.UNKNOWN.bytes).toBe(63 * GB)
    expect(s.byBucket.CAUTION.bytes).toBe(10 * GB)
  })

  it('does not treat similarly named siblings as nested', () => {
    const s = summarize([item('C:\\a\\tmp', 1 * GB, 'SAFE'), item('C:\\a\\tmp-old', 2 * GB, 'SAFE')])
    expect(s.totalBytes).toBe(3 * GB)
    expect(s.reclaimableBytes).toBe(3 * GB)
  })

  it('ignores case, slashes and trailing separators when comparing paths', () => {
    const s = summarize([item('c:/USERS/a/Temp/', 5 * GB, 'SAFE'), item('C:\\Users\\a\\temp\\inner', 1 * GB, 'CAUTION')])
    expect(s.totalBytes).toBe(5 * GB)
    expect(s.byBucket.CAUTION.bytes).toBe(1 * GB)
    expect(s.byBucket.SAFE.bytes).toBe(4 * GB)
  })

  it('never goes negative when the listed children add up to more than their parent', () => {
    const s = summarize([item('C:\\a\\p', 1 * GB, 'SAFE'), item('C:\\a\\p\\c1', 2 * GB, 'CAUTION')])
    expect(s.byBucket.SAFE.bytes).toBe(0)
    expect(s.totalBytes).toBe(2 * GB)
  })

  it('counts a folder whose verdict changes (for example after an AI answer) in its new bucket', () => {
    const before = summarize([item('C:\\a\\x', 4 * GB, null)])
    expect(before.byBucket.UNKNOWN.bytes).toBe(4 * GB)
    expect(before.reclaimableBytes).toBe(0)
    const after = summarize([item('C:\\a\\x', 4 * GB, 'REBUILDS_AUTOMATICALLY')])
    expect(after.byBucket.UNKNOWN.bytes).toBe(0)
    expect(after.reclaimableBytes).toBe(4 * GB)
  })

  it('handles nothing, and results with nothing reclaimable', () => {
    expect(summarize([])).toMatchObject({ count: 0, totalBytes: 0, reclaimableBytes: 0 })
    expect(summarize([item('C:\\Windows', 9 * GB, 'DONT_TOUCH')]).reclaimableBytes).toBe(0)
  })
})

describe('buildForest / flattenLedger', () => {
  const sample = [
    item('C:\\a\\small', 1 * GB, null),
    item('C:\\a\\Google', 93 * GB, null),
    item('C:\\a\\Google\\Chrome', 30 * GB, null),
    item('C:\\a\\Google\\Chrome\\Cache', 20 * GB, 'REBUILDS_AUTOMATICALLY'),
    item('C:\\a\\Google\\Android', 40 * GB, 'CAUTION'),
    item('C:\\b\\other', 5 * GB, 'SAFE')
  ]

  it('puts folders under their closest listed parent', () => {
    const forest = buildForest(sample)
    const google = forest.find((n) => n.item.metadata.name === 'Google')!
    expect(google.children.map((c) => c.item.metadata.name)).toEqual(['Android', 'Chrome'])
    const chrome = google.children.find((c) => c.item.metadata.name === 'Chrome')!
    expect(chrome.children.map((c) => c.item.metadata.name)).toEqual(['Cache'])
  })

  it('orders the ledger: roots biggest first, each followed by what is inside it', () => {
    expect(flattenLedger(sample).map((r) => `${r.depth}:${r.item.metadata.name}`)).toEqual([
      '0:Google',
      '1:Android',
      '1:Chrome',
      '2:Cache',
      '0:other',
      '0:small'
    ])
  })

  it('treats results that are not inside each other as separate roots', () => {
    const rows = flattenLedger([item('C:\\a\\tmp', 1 * GB, null), item('C:\\a\\tmp-old', 2 * GB, null)])
    expect(rows.map((r) => r.depth)).toEqual([0, 0])
  })

  it('compares paths without regard to case or slashes', () => {
    expect(normPath('C:/Users/A/')).toBe('c:\\users\\a')
    const rows = flattenLedger([item('C:\\Users\\A', 10 * GB, null), item('c:/users/a/data', 4 * GB, null)])
    expect(rows.map((r) => r.depth)).toEqual([0, 1])
  })

  it('works with no results', () => {
    expect(flattenLedger([])).toEqual([])
  })
})
