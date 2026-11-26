import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MAX_SAMPLE_NAMES, ScanCancelledError, extOf, scanFolder, type ScanFs } from '../src/main/scanner/scan-core'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dirvo-test-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const write = (rel: string, content: string | Buffer = 'x'): void => {
  const full = join(root, rel)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content)
}

describe('extOf', () => {
  it('lower-cases and handles edge cases', () => {
    expect(extOf('A.TXT')).toBe('.txt')
    expect(extOf('archive.tar.gz')).toBe('.gz')
    expect(extOf('Makefile')).toBe('(none)')
    expect(extOf('.gitignore')).toBe('(none)')
    expect(extOf('weird.')).toBe('(none)')
  })
})

describe('scanFolder', () => {
  it('counts files, dirs, size and extensions across nested folders', async () => {
    write('a.js', '12345')
    write('b.JS', '123')
    write('sub/c.json', '1234567890')
    write('sub/deep/d')
    const r = await scanFolder(root)
    expect(r.fileCount).toBe(4)
    expect(r.dirCount).toBe(2)
    expect(r.sizeBytes).toBe(5 + 3 + 10 + 1)
    expect(r.extensionCounts).toEqual({ '.js': 2, '.json': 1, '(none)': 1 })
    expect(r.unreadableCount).toBe(0)
  })

  it('reports an empty folder with null file dates', async () => {
    const r = await scanFolder(root)
    expect(r).toMatchObject({ fileCount: 0, dirCount: 0, sizeBytes: 0, oldestFileAt: null, newestFileAt: null })
    expect(r.sampleFileNames).toEqual([])
  })

  it('caps sample names at 30 and prefers shallow files', async () => {
    write('deep/a/b/zzz-deep.txt')
    for (let i = 0; i < 40; i++) write(`top${String(i).padStart(2, '0')}.txt`)
    const r = await scanFolder(root)
    expect(r.sampleFileNames).toHaveLength(MAX_SAMPLE_NAMES)
    expect(r.sampleFileNames).not.toContain('zzz-deep.txt')
    expect(r.fileCount).toBe(41)
  })

  it('tracks oldest and newest file dates', async () => {
    write('old.txt')
    write('new.txt')
    utimesSync(join(root, 'old.txt'), new Date('2020-01-01T00:00:00Z'), new Date('2020-01-01T00:00:00Z'))
    utimesSync(join(root, 'new.txt'), new Date('2024-06-01T00:00:00Z'), new Date('2024-06-01T00:00:00Z'))
    const r = await scanFolder(root)
    expect(r.oldestFileAt).toBe('2020-01-01T00:00:00.000Z')
    expect(r.newestFileAt).toBe('2024-06-01T00:00:00.000Z')
  })

  it('does not follow symlinks and counts them', async () => {
    write('real/file.txt', 'abc')
    try {
      symlinkSync(join(root, 'real'), join(root, 'link'), 'junction')
    } catch {
      return // cannot create links in this environment
    }
    const r = await scanFolder(root)
    expect(r.fileCount).toBe(1)
    expect(r.linksSkipped).toBe(1)
  })

  it('rejects a missing folder and a file path', async () => {
    await expect(scanFolder(join(root, 'nope'))).rejects.toThrow(/not found/i)
    write('f.txt')
    await expect(scanFolder(join(root, 'f.txt'))).rejects.toThrow(/not a folder/i)
  })

  it('counts unreadable subfolders and unreadable files instead of failing', async () => {
    write('ok.txt', 'abc')
    write('locked/inner.txt')
    write('bad.txt')
    const denied = Object.assign(new Error('EPERM'), { code: 'EPERM' })
    const fs: ScanFs = {
      readdir: async (p) => {
        if (p.endsWith('locked')) throw denied
        const { promises } = await import('node:fs')
        return promises.readdir(p, { withFileTypes: true })
      },
      lstat: async (p) => {
        if (p.endsWith('bad.txt')) throw denied
        const { promises } = await import('node:fs')
        return promises.lstat(p)
      }
    }
    const r = await scanFolder(root, { fs })
    expect(r.fileCount).toBe(1)
    expect(r.sizeBytes).toBe(3)
    expect(r.unreadableCount).toBe(2)
  })

  it('fails if the root itself cannot be read', async () => {
    const fs: ScanFs = {
      readdir: async () => {
        throw new Error('EPERM')
      },
      lstat: async () => (await import('node:fs')).promises.lstat(root)
    }
    await expect(scanFolder(root, { fs })).rejects.toThrow(/cannot read/i)
  })

  it('never opens or reads files: only readdir and lstat are used', async () => {
    write('secret.txt', 'top secret')
    const calls: string[] = []
    const real = await import('node:fs')
    const fs: ScanFs = {
      readdir: (p) => {
        calls.push('readdir')
        return real.promises.readdir(p, { withFileTypes: true })
      },
      lstat: (p) => {
        calls.push('lstat')
        return real.promises.lstat(p)
      }
    }
    await scanFolder(root, { fs })
    expect(new Set(calls)).toEqual(new Set(['readdir', 'lstat']))
  })

  it('cancels promptly', async () => {
    for (let i = 0; i < 5; i++) write(`d${i}/f.txt`)
    let checks = 0
    await expect(scanFolder(root, { isCancelled: () => ++checks > 2 })).rejects.toBeInstanceOf(ScanCancelledError)
  })

  it('reports progress, ending with the final totals', async () => {
    write('a.txt', '123')
    write('b/c.txt', '45')
    const updates: { filesScanned: number; bytesScanned: number }[] = []
    await scanFolder(root, { onProgress: (p) => updates.push(p) })
    expect(updates.length).toBeGreaterThan(0)
    expect(updates[updates.length - 1]).toMatchObject({ filesScanned: 2, bytesScanned: 5 })
  })
})
