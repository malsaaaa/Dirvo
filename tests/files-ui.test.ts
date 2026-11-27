import { describe, expect, it } from 'vitest'
import { applyView, DEFAULT_VIEW } from '../src/renderer/src/lib/ledger-view'
import { buildReport } from '../src/renderer/src/lib/report'
import { summarize } from '../src/renderer/src/lib/summary'
import { flattenLedger } from '../src/renderer/src/lib/tree'
import { fileMetadata } from '../src/main/scanner/scan-file'
import type { FolderExplanation, ScannedFolder, Verdict } from '../src/shared/types'
import { meta } from './helpers'

const GB = 1024 ** 3
const NOW = new Date(2026, 10, 26, 22, 30)

const ex = (verdict: Verdict, over: Partial<FolderExplanation> = {}): FolderExplanation => ({
  whatItIs: 'Something.',
  createdBy: 'Acme',
  verdict,
  confidence: 'HIGH',
  consequenceIfDeleted: 'Gone.',
  source: 'database',
  ...over
})

const folder = (path: string, size: number, verdict: Verdict | null): ScannedFolder => ({
  metadata: meta({ path, name: path.split('\\').pop() as string, sizeBytes: size }),
  explanation: verdict ? ex(verdict) : null,
  aiStatus: 'none',
  scannedAt: '2026-11-26T10:00:00.000Z'
})

const file = (path: string, size: number, verdict: Verdict | null): ScannedFolder => ({
  metadata: fileMetadata(path, { size, mtimeMs: Date.parse('2024-01-01T00:00:00Z'), birthtimeMs: Date.parse('2023-01-01T00:00:00Z') }),
  explanation: verdict ? ex(verdict) : null,
  aiStatus: 'none',
  scannedAt: '2026-11-26T10:00:00.000Z'
})

describe('files in the ledger', () => {
  const items = [folder('C:\\Big', 10 * GB, null), file('C:\\Big\\movie.mkv', 4 * GB, 'CAUTION'), file('C:\\pagefile.sys', 8 * GB, 'DONT_TOUCH')]

  it('sits under the folder that contains it, like a folder found by Look inside', () => {
    const rows = flattenLedger(items)
    expect(rows.map((r) => [r.item.metadata.name, r.depth])).toEqual([
      ['Big', 0],
      ['movie.mkv', 1],
      ['pagefile.sys', 0]
    ])
  })

  it('does not count a file twice when it is inside a folder that is also listed', () => {
    const s = summarize(items)
    expect(s.totalBytes).toBe(10 * GB + 8 * GB) // movie.mkv is part of Big
    expect(s.byBucket.CAUTION).toEqual({ bytes: 4 * GB, count: 1 })
    expect(s.byBucket.UNKNOWN).toEqual({ bytes: 6 * GB, count: 1 })
  })

  it('is found by search and filters like a folder', () => {
    expect(applyView(items, { ...DEFAULT_VIEW, query: 'movie' }).rows.map((r) => r.item.metadata.name)).toEqual(['movie.mkv'])
    expect(applyView(items, { ...DEFAULT_VIEW, filter: 'DONT_TOUCH' }).rows.map((r) => r.item.metadata.name)).toEqual(['pagefile.sys'])
  })
})

describe('reports with files', () => {
  const items = [folder('C:\\Big', 10 * GB, null), file('C:\\Big\\movie.mkv', 4 * GB, 'CAUTION')]
  const rows = flattenLedger(items)

  it('Markdown says items, marks the file, and gives it no file counts', () => {
    const md = buildReport('md', rows, NOW)
    expect(md).toContain('· 2 items ·')
    expect(md).toContain('## Folders and files')
    expect(md).toContain('| Name | Size |')
    expect(md).toContain('- **Size:** 4.0 GB (a file)')
    expect(md).not.toContain('movie.mkv` | 4.0 GB | Careful | Acme | |\n\n')
  })

  it('a report of folders only keeps its original wording', () => {
    const md = buildReport('md', flattenLedger([folder('C:\\A', GB, null)]), NOW)
    expect(md).toContain('1 folder')
    expect(md).toContain('## Folders')
    expect(md).not.toContain('items')
  })

  it('CSV has a Name column first and a Type column that tells files from folders', () => {
    const lines = buildReport('csv', rows, NOW).trimEnd().split('\r\n')
    expect(lines[0].startsWith('Name,Type,Path,')).toBe(true)
    expect(lines[1].startsWith('Big,Folder,')).toBe(true)
    expect(lines[2].startsWith('movie.mkv,File,')).toBe(true)
  })

  it('says "not changed" for an idle file, not "nothing in it"', () => {
    const md = buildReport('md', flattenLedger([file('C:\\old.iso', GB, 'CAUTION')]), NOW)
    expect(md).toContain('**Idle:** not changed for')
  })
})
