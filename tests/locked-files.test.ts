import { describe, expect, it } from 'vitest'
import type { Dirent, Stats } from 'node:fs'
import { createLockedStat, isLockedError, parseLockedOutput } from '../src/main/scanner/locked-files'
import { inspectFile, listBigFiles, type ListFs } from '../src/main/scanner/scan-file'

const MB = 1024 * 1024
const GB = 1024 * MB

const busy = Object.assign(new Error('EBUSY'), { code: 'EBUSY' })
const gone = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })

const fakeStat = (size: number): Stats =>
  ({
    size,
    mtimeMs: Date.parse('2024-05-01T00:00:00Z'),
    birthtimeMs: Date.parse('2024-01-01T00:00:00Z'),
    isDirectory: () => false,
    isSymbolicLink: () => false,
    isFile: () => true
  }) as unknown as Stats

const dirent = (name: string): Dirent =>
  ({ name, isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false }) as unknown as Dirent

// What the listing script prints for pagefile.sys and swapfile.sys (sizes and dates as Windows reports them).
const lockedOut = JSON.stringify([
  { n: 'pagefile.sys', s: 16 * GB, m: '2026-11-27T03:36:40.0704494Z', c: '2026-10-27T11:25:39.5899367Z' },
  { n: 'swapfile.sys', s: 16 * MB, m: '2026-11-27T03:36:40.1018485Z', c: '2026-10-27T11:25:39.8442462Z' }
])

describe('files Windows keeps locked (pagefile.sys, hiberfil.sys)', () => {
  it('reads the listing output, one row or many, and ignores anything malformed', () => {
    expect(parseLockedOutput(lockedOut).get('pagefile.sys')).toMatchObject({ size: 16 * GB })
    expect(parseLockedOutput(JSON.stringify({ n: 'A.sys', s: 5, m: '2026-01-01T00:00:00Z', c: '2026-01-01T00:00:00Z' })).get('a.sys')?.size).toBe(5)
    expect(parseLockedOutput('').size).toBe(0)
    expect(parseLockedOutput('not json').size).toBe(0)
    expect(parseLockedOutput(JSON.stringify([{ n: 'x', s: -1 }, { n: '', s: 1 }, { s: 3 }, null, 7, { n: 'y', s: 'big' }])).size).toBe(0)
  })

  it('only treats "busy or protected" errors as locked, not "not found"', () => {
    expect(isLockedError(busy)).toBe(true)
    expect(isLockedError(Object.assign(new Error('x'), { code: 'EPERM' }))).toBe(true)
    expect(isLockedError(gone)).toBe(false)
    expect(isLockedError(null)).toBe(false)
  })

  it('passes folder and file names through the environment, never the command line or the script', async () => {
    const calls: Array<{ file: string; args: string[]; env: Record<string, string> }> = []
    const stat = createLockedStat(async (file, args, env) => {
      calls.push({ file, args, env })
      return lockedOut
    }, 'C:\\Windows')
    const evil = "x'; Remove-Item C:\\ -Recurse; '"
    await stat('C:\\a b\\$(calc)', ['pagefile.sys', evil])
    expect(calls).toHaveLength(1)
    expect(calls[0].file).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
    const everythingOnTheCommandLine = calls[0].args.join(' ')
    expect(everythingOnTheCommandLine).not.toContain('calc')
    expect(everythingOnTheCommandLine).not.toContain('Remove-Item')
    expect(calls[0].env.DIRVO_DIR).toBe('C:\\a b\\$(calc)')
    expect(JSON.parse(calls[0].env.DIRVO_NAMES)).toEqual(['pagefile.sys', evil])
  })

  it('returns nothing, and does not throw, when PowerShell is missing or fails', async () => {
    const stat = createLockedStat(async () => Promise.reject(new Error('ENOENT')), 'C:\\Windows')
    expect((await stat('C:\\', ['pagefile.sys'])).size).toBe(0)
    let started = 0
    const idle = createLockedStat(async () => {
      started++
      return ''
    })
    expect((await idle('C:\\', [])).size).toBe(0)
    expect(started).toBe(0) // nothing to look up, nothing started
  })

  it('inspectFile gets the size of a locked file from the listing', async () => {
    const locked = async (dir: string, names: string[]): Promise<ReturnType<typeof parseLockedOutput>> => {
      expect(dir).toBe('C:\\')
      expect(names).toEqual(['pagefile.sys'])
      return parseLockedOutput(lockedOut)
    }
    const r = await inspectFile('C:\\pagefile.sys', { lstat: async () => Promise.reject(busy) }, locked)
    expect(r.status).toBe('file')
    if (r.status === 'file') expect(r.metadata).toMatchObject({ kind: 'file', name: 'pagefile.sys', sizeBytes: 16 * GB })
  })

  it('inspectFile says the file is locked when it cannot find out more, and "not found" for a missing file', async () => {
    const r = await inspectFile('C:\\pagefile.sys', { lstat: async () => Promise.reject(busy) })
    expect(r).toMatchObject({ status: 'error', message: expect.stringContaining('locked') })
    const missing = await inspectFile('C:\\nope.txt', { lstat: async () => Promise.reject(gone) }, async () => {
      throw new Error('must not be asked')
    })
    expect(missing).toMatchObject({ status: 'error', message: expect.stringContaining('not found') })
  })

  it('listBigFiles adds locked files at or above the size, and asks only once', async () => {
    let asked = 0
    const fs: ListFs = {
      readdir: async () => [dirent('pagefile.sys'), dirent('swapfile.sys'), dirent('big.iso'), dirent('hiberfil.sys')],
      lstat: async (p) => {
        if (/(pagefile|swapfile|hiberfil)\.sys$/.test(p)) throw busy
        return fakeStat(300 * MB)
      }
    }
    const out = await listBigFiles('C:\\', 100 * MB, fs, async (_dir, names) => {
      asked++
      expect(names).toEqual(['pagefile.sys', 'swapfile.sys', 'hiberfil.sys'])
      return parseLockedOutput(lockedOut) // no row for hiberfil.sys: it just is not listed
    })
    expect(asked).toBe(1)
    expect(out.map((f) => f.name)).toEqual(['pagefile.sys', 'big.iso']) // swapfile.sys is under the size
    expect(out[0].sizeBytes).toBe(16 * GB)
  })

  it('listBigFiles does not start anything when no file is locked', async () => {
    const fs: ListFs = { readdir: async () => [dirent('a.iso')], lstat: async () => fakeStat(300 * MB) }
    let asked = 0
    const out = await listBigFiles('C:\\d', 1, fs, async () => {
      asked++
      return new Map()
    })
    expect(out).toHaveLength(1)
    expect(asked).toBe(0)
  })
})
