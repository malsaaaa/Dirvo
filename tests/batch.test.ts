import { describe, expect, it } from 'vitest'
import { MAX_BATCH, countUnknown, pickUnknown, runBatch, type ExplainOutcome } from '../src/renderer/src/lib/batch'
import type { FolderExplanation, ScannedFolder } from '../src/shared/types'
import { meta } from './helpers'

const known: FolderExplanation = { whatItIs: 'x', createdBy: 'y', verdict: 'SAFE', confidence: 'HIGH', consequenceIfDeleted: 'z', source: 'database' }

const item = (path: string, size: number, explained = false, aiStatus: ScannedFolder['aiStatus'] = 'none'): ScannedFolder => ({
  metadata: meta({ path, name: path.split('\\').pop() as string, sizeBytes: size }),
  explanation: explained ? known : null,
  aiStatus,
  scannedAt: '2026-11-26T10:00:00.000Z'
})

describe('pickUnknown', () => {
  it('takes only folders with no answer, biggest first', () => {
    const items = [item('C:\\a\\small', 1), item('C:\\a\\known', 99, true), item('C:\\a\\big', 50), item('C:\\a\\mid', 10)]
    expect(pickUnknown(items)).toEqual(['C:\\a\\big', 'C:\\a\\mid', 'C:\\a\\small'])
  })

  it('skips folders the AI is already working on, but retries ones that failed or waited for a key', () => {
    const items = [item('C:\\a\\busy', 5, false, 'loading'), item('C:\\a\\failed', 4, false, 'error'), item('C:\\a\\nokey', 3, false, 'no-key'), item('C:\\a\\new', 2)]
    expect(pickUnknown(items)).toEqual(['C:\\a\\failed', 'C:\\a\\nokey', 'C:\\a\\new'])
  })

  it('caps the run, keeping the largest', () => {
    const many = Array.from({ length: MAX_BATCH + 25 }, (_, i) => item(`C:\\a\\f${i}`, i + 1))
    const picked = pickUnknown(many)
    expect(picked).toHaveLength(MAX_BATCH)
    expect(picked[0]).toBe(`C:\\a\\f${MAX_BATCH + 24}`)
    expect(pickUnknown(many, 3)).toHaveLength(3)
  })

  it('does not change the list it is given', () => {
    const items = [item('C:\\a\\x', 1), item('C:\\a\\y', 2)]
    pickUnknown(items)
    expect(items.map((i) => i.metadata.name)).toEqual(['x', 'y'])
  })

  it('counts every unknown folder, not just the capped few', () => {
    const many = Array.from({ length: 80 }, (_, i) => item(`C:\\a\\f${i}`, i))
    expect(countUnknown(many)).toBe(80)
    expect(countUnknown([item('C:\\a\\k', 1, true)])).toBe(0)
  })
})

const paths = (n: number): string[] => Array.from({ length: n }, (_, i) => `C:\\a\\f${i}`)
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('runBatch', () => {
  it('asks about every folder and reports the totals', async () => {
    const asked: string[] = []
    const s = await runBatch(paths(5), async (p) => {
      asked.push(p)
      return 'ok'
    })
    expect(asked.sort()).toEqual(paths(5).sort())
    expect(s).toEqual({ done: 5, ok: 5, failed: 0, stopped: null, total: 5 })
  })

  it('never has more requests in flight than the limit', async () => {
    let active = 0
    let peak = 0
    await runBatch(
      paths(10),
      async () => {
        active++
        peak = Math.max(peak, active)
        await delay(5)
        active--
        return 'ok'
      },
      { concurrency: 2 }
    )
    expect(peak).toBe(2)
  })

  it('reports progress as it goes, ending at the total', async () => {
    const seen: Array<{ done: number; failed: number }> = []
    await runBatch(paths(4), async (p) => (p.endsWith('f1') ? 'error' : 'ok'), { onProgress: (p) => seen.push({ done: p.done, failed: p.failed }) })
    expect(seen[0]).toEqual({ done: 0, failed: 0 })
    expect(seen[seen.length - 1]).toEqual({ done: 4, failed: 1 })
  })

  it('stops starting new requests as soon as there is no key', async () => {
    const asked: string[] = []
    const s = await runBatch(
      paths(10),
      async (p) => {
        asked.push(p)
        return 'no-key'
      },
      { concurrency: 1 }
    )
    expect(asked).toHaveLength(1)
    expect(s.stopped).toBe('no-key')
    expect(s.failed).toBe(1)
  })

  it('stops after several failures in a row, but not for scattered ones', async () => {
    const outcomes: ExplainOutcome[] = ['error', 'error', 'ok', 'error', 'error', 'ok', 'ok']
    let i = 0
    const scattered = await runBatch(paths(7), async () => outcomes[i++], { concurrency: 1 })
    expect(scattered.stopped).toBeNull()
    expect(scattered.failed).toBe(4)

    const asked: string[] = []
    const broken = await runBatch(
      paths(10),
      async (p) => {
        asked.push(p)
        return 'error'
      },
      { concurrency: 1 }
    )
    expect(broken.stopped).toBe('errors')
    expect(asked).toHaveLength(3)
  })

  it('treats a request that throws as an error instead of crashing', async () => {
    const s = await runBatch(
      paths(4),
      async () => {
        throw new Error('boom')
      },
      { concurrency: 1 }
    )
    expect(s.stopped).toBe('errors')
    expect(s.failed).toBe(3)
  })

  it('can be cancelled between requests', async () => {
    let cancelled = false
    const asked: string[] = []
    const s = await runBatch(
      paths(10),
      async (p) => {
        asked.push(p)
        if (asked.length === 2) cancelled = true
        return 'ok'
      },
      { concurrency: 1, isCancelled: () => cancelled }
    )
    expect(asked).toHaveLength(2)
    expect(s.stopped).toBe('cancelled')
    expect(s.done).toBe(2)
  })

  it('lets requests already sent finish when it stops', async () => {
    let finished = 0
    const s = await runBatch(
      paths(6),
      async (p) => {
        await delay(p.endsWith('f0') ? 2 : 15)
        finished++
        return p.endsWith('f0') ? 'no-key' : 'ok'
      },
      { concurrency: 2 }
    )
    expect(s.stopped).toBe('no-key')
    expect(finished).toBe(s.done) // nothing that started was abandoned
  })

  it('handles an empty list', async () => {
    expect(await runBatch([], async () => 'ok')).toEqual({ done: 0, ok: 0, failed: 0, stopped: null, total: 0 })
  })
})
