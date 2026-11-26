import { describe, expect, it } from 'vitest'
import { buildReport, csvCell, mdCell, mdCode, reportFileName } from '../src/renderer/src/lib/report'
import { flattenLedger } from '../src/renderer/src/lib/tree'
import {
  MAX_REPORT_BYTES,
  ReportRequestError,
  prepareContent,
  safeFileName,
  validateReportRequest,
  withExtension
} from '../src/main/storage/report-file'
import type { FolderExplanation, ScannedFolder, Verdict } from '../src/shared/types'
import { meta } from './helpers'

const GB = 1024 ** 3
const NOW = new Date(2026, 10, 26, 22, 30)

const explanation = (verdict: Verdict, over: Partial<FolderExplanation> = {}): FolderExplanation => ({
  whatItIs: 'A cache.',
  createdBy: 'Acme',
  verdict,
  confidence: 'HIGH',
  consequenceIfDeleted: 'It is rebuilt.',
  source: 'database',
  ...over
})

const item = (path: string, size: number, verdict: Verdict | null, over: Partial<ScannedFolder> = {}, ex: Partial<FolderExplanation> = {}): ScannedFolder => ({
  metadata: meta({ path, name: path.split('\\').pop() as string, sizeBytes: size }),
  explanation: verdict ? explanation(verdict, ex) : null,
  aiStatus: 'none',
  scannedAt: '2026-11-26T10:00:00.000Z',
  ...over
})

const sample = [
  item('C:\\a\\Temp', 22 * GB, 'SAFE', {}, { createdBy: 'Windows' }),
  item('C:\\a\\npm-cache', 8 * GB, 'REBUILDS_AUTOMATICALLY', {}, { howToClean: { text: 'npm can clear its own cache.', command: 'npm cache clean --force' } }),
  item('C:\\a\\Mystery', 5 * GB, null)
]
const rows = flattenLedger(sample)

describe('Markdown report', () => {
  const md = buildReport('md', rows, NOW)

  it('starts with a title, the date and a summary', () => {
    expect(md.startsWith('# Dirvo report')).toBe(true)
    expect(md).toContain('Generated Nov 26, 10:30 PM · 3 folders')
    expect(md).toContain('**30 GB can be reclaimed**, in 2 of 3 folders rated Safe or Rebuilds')
    expect(md).toContain('Dirvo never deletes anything')
  })

  it('has a table of rulings with each bucket that is present', () => {
    expect(md).toContain('| Safe to delete | 1 | 22 GB |')
    expect(md).toContain('| Rebuilds automatically | 1 | 8.0 GB |')
    expect(md).toContain('| Unknown | 1 | 5.0 GB |')
    expect(md).not.toContain("| Don't touch |")
  })

  it('lists every folder in ledger order with its ruling and maker', () => {
    expect(md).toContain('| `Temp` | 22 GB | Safe to delete | Windows |')
    expect(md).toContain('| `Mystery` | 5.0 GB | Unknown |')
  })

  it('gives details, including how to clean and the exact command', () => {
    expect(md).toContain('### `npm-cache`')
    expect(md).toContain('- **To clean:** npm can clear its own cache.')
    expect(md).toContain('  - Command: `npm cache clean --force`')
    expect(md).toContain('- **Ruling:** Unknown. Dirvo does not recognise this folder')
  })

  it('says when a ruling is only an AI estimate', () => {
    const r = flattenLedger([item('C:\\a\\x', GB, 'CAUTION', {}, { source: 'ai', confidence: 'LOW' })])
    expect(buildReport('md', r, NOW)).toContain('Be careful (AI estimate, low confidence)')
  })

  it('shows folders found by Look inside indented under their parent', () => {
    const tree = flattenLedger([item('C:\\a\\Google', 93 * GB, null), item('C:\\a\\Google\\Chrome', 7 * GB, 'DONT_TOUCH')])
    const out = buildReport('md', tree, NOW)
    expect(out.indexOf('`Google`')).toBeLessThan(out.indexOf('↳ `Chrome`'))
  })

  it('reports the change since the last scan', () => {
    const grew = flattenLedger([item('C:\\a\\x', 8 * GB, 'SAFE', { previous: { sizeBytes: 5 * GB, scannedAt: '2026-11-12T10:00:00.000Z' } })])
    const out = buildReport('md', grew, NOW)
    expect(out).toContain('**+3.0 GB**')
    expect(out).toContain('| +3.0 GB |')
  })

  it('handles an empty list', () => {
    const out = buildReport('md', [], NOW)
    expect(out).toContain('No folders.')
    expect(out).toContain('None of the 0 folders')
  })

  it('cannot be broken or turned into markup by hostile folder names', () => {
    const evil = flattenLedger([
      item('C:\\a\\x|y`z', GB, 'SAFE', {}, { createdBy: 'Evil | Corp <script>alert(1)</script>', whatItIs: 'line1\nline2' })
    ])
    const out = buildReport('md', evil, NOW)
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
    expect(out).toContain('Evil \\| Corp')
    expect(out).not.toMatch(/line1\nline2/)
    // names and paths sit in code spans, so the pipe cannot split a table row
    expect(out).toContain('``x|y`z``')
  })

  it('keeps a <USER> placeholder visible, because paths are in code spans', () => {
    const r = flattenLedger([item('C:\\Users\\<USER>\\AppData\\Local\\Temp', GB, 'SAFE')])
    expect(buildReport('md', r, NOW)).toContain('`C:\\Users\\<USER>\\AppData\\Local\\Temp`')
  })

  it('caps the details section for very long lists', () => {
    const many = flattenLedger(Array.from({ length: 230 }, (_, i) => item(`C:\\a\\f${i}`, GB + i, 'SAFE')))
    const out = buildReport('md', many, NOW)
    expect(out).toContain('Details are shown for the first 200 of 230 folders')
    expect(out.match(/^### /gm)).toHaveLength(200)
  })
})

describe('mdCode / mdCell', () => {
  it('fences code with enough backticks', () => {
    expect(mdCode('plain')).toBe('`plain`')
    expect(mdCode('a`b')).toBe('``a`b``')
    expect(mdCode('`edge`')).toBe('`` `edge` ``')
    expect(mdCode('one\nline')).toBe('`one line`')
  })
  it('escapes pipes, angle brackets and line breaks in table text', () => {
    expect(mdCell('a|b')).toBe('a\\|b')
    expect(mdCell('<b>x</b>')).toBe('&lt;b&gt;x&lt;/b&gt;')
    expect(mdCell('a\r\nb')).toBe('a b')
  })
})

describe('CSV report', () => {
  const csv = buildReport('csv', rows, NOW)
  const lines = csv.trimEnd().split('\r\n')

  it('has a header and one row per folder, ending with a line break', () => {
    expect(lines).toHaveLength(4)
    expect(lines[0].startsWith('Folder,Path,Size (bytes),Size,Ruling')).toBe(true)
    expect(csv.endsWith('\r\n')).toBe(true)
  })

  it('writes exact byte counts and readable sizes', () => {
    expect(lines[1]).toContain(`,${22 * GB},22 GB,Safe to delete,`)
  })

  it('includes the cleanup command', () => {
    expect(csv).toContain('npm cache clean --force')
  })

  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell(42)).toBe('42')
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('neutralises spreadsheet formulas in folder names and text', () => {
    for (const bad of ['=HYPERLINK("http://evil","x")', '+1+1', '-2+3', '@SUM(A1)', '\tcmd', '\rcmd']) {
      expect(csvCell(bad).replace(/^"/, '')).toMatch(/^'/)
    }
    // a negative number is a number, not text from a folder name
    expect(csvCell(-5)).toBe('-5')
    const evil = buildReport('csv', flattenLedger([item('C:\\a\\=cmd|calc', GB, null)]), NOW)
    expect(evil).toContain("'=cmd|calc")
  })

  it('has the same number of cells on every row, even with awkward text', () => {
    const awkward = flattenLedger([item('C:\\a\\x,"y"\nz', GB, 'SAFE', {}, { whatItIs: 'has, commas and "quotes"\nand lines' })])
    const text = buildReport('csv', awkward, NOW)
    const parse = (t: string): string[][] => {
      const out: string[][] = []
      let row: string[] = []
      let cell = ''
      let q = false
      for (let i = 0; i < t.length; i++) {
        const c = t[i]
        if (q) {
          if (c === '"' && t[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') q = false
          else cell += c
        } else if (c === '"') q = true
        else if (c === ',') { row.push(cell); cell = '' }
        else if (c === '\r' && t[i + 1] === '\n') { row.push(cell); out.push(row); row = []; cell = ''; i++ }
        else cell += c
      }
      return out
    }
    const table = parse(text)
    expect(table).toHaveLength(2)
    expect(table[1]).toHaveLength(table[0].length)
    expect(table[1][0]).toBe('x,"y"\nz')
  })
})

describe('file names and content', () => {
  it('builds a dated default name', () => {
    expect(reportFileName('md', NOW)).toBe('dirvo-report-2026-11-26.md')
    expect(reportFileName('csv', new Date(2026, 0, 5))).toBe('dirvo-report-2026-01-05.csv')
  })

  it('makes any suggested name safe and keeps the right extension', () => {
    expect(safeFileName('report', 'md')).toBe('report.md')
    expect(safeFileName('report.md', 'md')).toBe('report.md')
    expect(safeFileName('my:bad|name?.csv', 'csv')).toBe('mybadname.csv')
    expect(safeFileName('..\\..\\Windows\\evil', 'md')).toBe('.. .. Windows evil.md')
    expect(safeFileName('', 'md')).toBe('dirvo-report.md')
    expect(safeFileName('CON', 'csv')).toBe('dirvo-report.csv')
    expect(safeFileName('nul.md', 'md')).toBe('dirvo-report.md')
    expect(safeFileName('trailing. . ', 'md')).toBe('trailing.md')
    expect(safeFileName('x'.repeat(300), 'md')).toHaveLength(103)
  })

  it('never leaves a path separator in the suggested name', () => {
    for (const name of ['a/b', 'a\\b', 'C:\\x\\y', '../../x']) expect(safeFileName(name, 'md')).not.toMatch(/[\\/]/)
  })

  it('adds the extension only when it is missing', () => {
    expect(withExtension('C:\\Users\\a\\Documents\\r', 'md')).toBe('C:\\Users\\a\\Documents\\r.md')
    expect(withExtension('C:\\r.MD', 'md')).toBe('C:\\r.MD')
    expect(withExtension('C:\\r.csv', 'md')).toBe('C:\\r.csv.md')
  })
})

describe('validateReportRequest / prepareContent', () => {
  const ok = { content: 'hello', format: 'md' as const, suggestedName: 'x', redactUser: true }

  it('accepts a normal request', () => {
    expect(validateReportRequest(ok)).toEqual(ok)
  })

  it.each([
    ['null', null],
    ['a string', 'x'],
    ['no content', { ...ok, content: '' }],
    ['non-string content', { ...ok, content: 5 }],
    ['an unknown format', { ...ok, format: 'exe' }],
    ['too large', { ...ok, content: 'x'.repeat(MAX_REPORT_BYTES + 1) }]
  ])('rejects %s', (_label, bad) => {
    expect(() => validateReportRequest(bad)).toThrow(ReportRequestError)
  })

  it('treats redactUser as off unless it is exactly true', () => {
    expect(validateReportRequest({ ...ok, redactUser: 'yes' }).redactUser).toBe(false)
    expect(validateReportRequest({ ...ok, redactUser: undefined }).redactUser).toBe(false)
  })

  it('replaces the username everywhere when asked', () => {
    const text = prepareContent({ ...ok, content: 'C:\\Users\\jdoe\\AppData and jdoe-notes.txt', redactUser: true }, ['jdoe'])
    expect(text).toBe('C:\\Users\\<USER>\\AppData and <USER>-notes.txt')
  })

  it('leaves the text alone when not asked', () => {
    expect(prepareContent({ ...ok, content: 'C:\\Users\\jdoe\\x', redactUser: false }, ['jdoe'])).toBe('C:\\Users\\jdoe\\x')
  })

  it('adds a byte order mark to CSV only, so Excel reads it as UTF-8', () => {
    expect(prepareContent({ ...ok, format: 'csv' }, []).startsWith('\uFEFF')).toBe(true)
    expect(prepareContent({ ...ok, format: 'md' }, []).startsWith('\uFEFF')).toBe(false)
  })
})
