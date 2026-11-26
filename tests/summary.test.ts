import { describe, expect, it } from 'vitest'
import { summarize } from '../src/renderer/src/lib/summary'
import type { ScannedFolder, Verdict } from '../src/shared/types'
import { meta } from './helpers'

const GB = 1024 ** 3

const item = (path: string, size: number, verdict: Verdict | null): ScannedFolder => ({
  metadata: meta({ path, name: path.split('\\').pop() as string, sizeBytes: size }),
  explanation: verdict
    ? { whatItIs: 'x', createdBy: 'y', verdict, confidence: 'HIGH', consequenceIfDeleted: 'z', source: 'database' }
    : null,
  aiStatus: 'none'
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

  it('never counts a folder twice when one result is inside another', () => {
    const s = summarize([
      item('C:\\Users\\a\\AppData\\Local\\Temp', 22 * GB, 'SAFE'),
      item('C:\\Users\\a\\AppData\\Local\\Temp\\build-cache', 3 * GB, 'SAFE'),
      item('C:\\Users\\a\\AppData\\Local\\Temp\\build-cache\\deep', 1 * GB, 'SAFE')
    ])
    expect(s.count).toBe(1)
    expect(s.reclaimableBytes).toBe(22 * GB)
  })

  it('does not treat similarly named siblings as nested', () => {
    const s = summarize([item('C:\\a\\tmp', 1 * GB, 'SAFE'), item('C:\\a\\tmp-old', 2 * GB, 'SAFE')])
    expect(s.count).toBe(2)
    expect(s.reclaimableBytes).toBe(3 * GB)
  })

  it('ignores case, slashes and trailing separators when comparing paths', () => {
    const s = summarize([item('c:/USERS/a/Temp/', 5 * GB, 'SAFE'), item('C:\\Users\\a\\temp\\inner', 1 * GB, 'SAFE')])
    expect(s.count).toBe(1)
    expect(s.totalBytes).toBe(5 * GB)
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
