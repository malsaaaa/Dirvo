import { describe, expect, it } from 'vitest'
import { scanDrive, type DriveScanDeps } from '../src/main/scanner/drive-scan'
import { isContainerFolder } from '../src/main/knowledge/system-paths'
import type { DriveScanItem, FolderMetadata, ScanOutcome } from '../src/shared/types'
import { meta } from './helpers'

const MB = 1024 * 1024

interface FakeTree {
  /** folder -> child folders (containers only) */
  children?: Record<string, string[]>
  /** folder -> size in bytes, or 'error' */
  sizes?: Record<string, number | 'error'>
  containers?: string[]
  /** how long each scan takes */
  delayMs?: number
}

function fakeDeps(tree: FakeTree, log: { active: number; maxActive: number; scanned: string[]; cancelled: string[] } = {
  active: 0,
  maxActive: 0,
  scanned: [],
  cancelled: []
}): { deps: DriveScanDeps; log: typeof log } {
  const deps: DriveScanDeps = {
    isContainer: (p) => (tree.containers ?? []).includes(p),
    listChildDirs: async (p) => {
      const c = tree.children?.[p]
      if (!c) throw new Error('EPERM')
      return c
    },
    explain: (p) => (p.endsWith('node_modules')
      ? { whatItIs: 'x', createdBy: 'npm', verdict: 'SAFE', confidence: 'HIGH', consequenceIfDeleted: 'y', source: 'database' }
      : null),
    scanFolder: (path, onProgress) => {
      let cancel = (): void => {}
      const promise = new Promise<ScanOutcome>((resolve) => {
        log.active++
        log.maxActive = Math.max(log.maxActive, log.active)
        log.scanned.push(path)
        const timer = setTimeout(() => {
          log.active--
          const size = tree.sizes?.[path]
          if (size === 'error' || size === undefined) return resolve({ status: 'error', message: 'denied' })
          onProgress({ currentPath: path, filesScanned: 1, bytesScanned: size })
          const m: FolderMetadata = meta({ path, name: path.split('\\').pop() as string, sizeBytes: size })
          resolve({ status: 'done', result: m })
        }, tree.delayMs ?? 1)
        cancel = () => {
          clearTimeout(timer)
          log.active--
          log.cancelled.push(path)
          resolve({ status: 'cancelled' })
        }
      })
      return { promise, cancel: () => cancel() }
    }
  }
  return { deps, log }
}

const run = async (tree: FakeTree, opts = {}): Promise<{ items: DriveScanItem[]; outcome: Awaited<ReturnType<typeof scanDrive>['promise']> }> => {
  const items: DriveScanItem[] = []
  const { deps } = fakeDeps(tree)
  const h = scanDrive('C:\\', deps, { onItem: (i) => items.push(i), onProgress: () => {} }, { progressIntervalMs: 0, ...opts })
  return { items, outcome: await h.promise }
}

describe('scanDrive', () => {
  it('looks inside container folders and scans the leaves, not the containers', async () => {
    const tree: FakeTree = {
      containers: ['C:\\', 'C:\\Users'],
      children: { 'C:\\': ['C:\\Users', 'C:\\Games'], 'C:\\Users': ['C:\\Users\\a', 'C:\\Users\\b'] },
      sizes: { 'C:\\Games': 900 * MB, 'C:\\Users\\a': 200 * MB, 'C:\\Users\\b': 100 * MB }
    }
    const { items, outcome } = await run(tree)
    expect(items.map((i) => i.metadata.path).sort()).toEqual(['C:\\Games', 'C:\\Users\\a', 'C:\\Users\\b'])
    expect(outcome).toMatchObject({ status: 'done', foldersScanned: 3, hiddenSmall: 0, skipped: 0 })
  })

  it('counts small folders instead of listing them', async () => {
    const tree: FakeTree = {
      containers: ['C:\\'],
      children: { 'C:\\': ['C:\\Big', 'C:\\Tiny', 'C:\\Small'] },
      sizes: { 'C:\\Big': 500 * MB, 'C:\\Tiny': 1024, 'C:\\Small': 10 * MB }
    }
    const { items, outcome } = await run(tree)
    expect(items.map((i) => i.metadata.name)).toEqual(['Big'])
    expect(outcome).toMatchObject({ status: 'done', foldersScanned: 3, hiddenSmall: 2 })
  })

  it('honours a custom size threshold', async () => {
    const tree: FakeTree = {
      containers: ['C:\\'],
      children: { 'C:\\': ['C:\\A'] },
      sizes: { 'C:\\A': 5 * MB }
    }
    expect((await run(tree, { minBytes: MB })).items).toHaveLength(1)
    expect((await run(tree, { minBytes: 10 * MB })).items).toHaveLength(0)
  })

  it('counts unreadable folders and containers as skipped, and keeps going', async () => {
    const tree: FakeTree = {
      containers: ['C:\\', 'C:\\Locked'],
      children: { 'C:\\': ['C:\\Locked', 'C:\\Denied', 'C:\\Fine'] }, // 'C:\\Locked' has no listing -> throws
      sizes: { 'C:\\Denied': 'error', 'C:\\Fine': 100 * MB }
    }
    const { items, outcome } = await run(tree)
    expect(items.map((i) => i.metadata.name)).toEqual(['Fine'])
    expect(outcome).toMatchObject({ status: 'done', skipped: 2, foldersScanned: 1 })
  })

  it('attaches the offline explanation, or null for unknown folders', async () => {
    const tree: FakeTree = {
      containers: ['C:\\'],
      children: { 'C:\\': ['C:\\proj\\node_modules', 'C:\\Mystery'] },
      sizes: { 'C:\\proj\\node_modules': 100 * MB, 'C:\\Mystery': 100 * MB }
    }
    const { items } = await run(tree)
    const by = Object.fromEntries(items.map((i) => [i.metadata.name, i.explanation]))
    expect(by['node_modules']?.verdict).toBe('SAFE')
    expect(by['Mystery']).toBeNull()
  })

  it('never runs more scans at once than the concurrency limit', async () => {
    const kids = Array.from({ length: 12 }, (_, i) => `C:\\F${i}`)
    const tree: FakeTree = {
      containers: ['C:\\'],
      children: { 'C:\\': kids },
      sizes: Object.fromEntries(kids.map((k) => [k, 100 * MB])),
      delayMs: 5
    }
    const { deps, log } = fakeDeps(tree)
    const h = scanDrive('C:\\', deps, { onItem: () => {}, onProgress: () => {} }, { concurrency: 3 })
    await h.promise
    expect(log.maxActive).toBe(3)
    expect(log.scanned).toHaveLength(12)
  })

  it('reports progress, ending with the final folder count', async () => {
    const tree: FakeTree = {
      containers: ['C:\\'],
      children: { 'C:\\': ['C:\\A', 'C:\\B'] },
      sizes: { 'C:\\A': 100 * MB, 'C:\\B': 200 * MB }
    }
    const progress: Array<{ foldersScanned: number; bytesScanned: number }> = []
    const { deps } = fakeDeps(tree)
    await scanDrive('C:\\', deps, { onItem: () => {}, onProgress: (p) => progress.push(p) }, { progressIntervalMs: 0 }).promise
    expect(progress.length).toBeGreaterThan(0)
    expect(progress[progress.length - 1]).toMatchObject({ foldersScanned: 2, bytesScanned: 300 * MB })
  })

  it('cancels: stops running scans, starts no new ones, and reports cancelled', async () => {
    const kids = Array.from({ length: 10 }, (_, i) => `C:\\F${i}`)
    const tree: FakeTree = {
      containers: ['C:\\'],
      children: { 'C:\\': kids },
      sizes: Object.fromEntries(kids.map((k) => [k, 100 * MB])),
      delayMs: 50
    }
    const { deps, log } = fakeDeps(tree)
    const items: DriveScanItem[] = []
    const h = scanDrive('C:\\', deps, { onItem: (i) => items.push(i), onProgress: () => {} }, { concurrency: 2 })
    await new Promise((r) => setTimeout(r, 15))
    h.cancel()
    const outcome = await h.promise
    expect(outcome).toEqual({ status: 'cancelled' })
    expect(log.cancelled.length).toBeGreaterThan(0)
    expect(log.scanned.length).toBeLessThan(10)
    expect(items).toHaveLength(0)
  })

  it('finishes cleanly on an empty drive', async () => {
    const { outcome } = await run({ containers: ['C:\\'], children: { 'C:\\': [] } })
    expect(outcome).toMatchObject({ status: 'done', foldersScanned: 0 })
  })
})

describe('isContainerFolder', () => {
  it.each([
    'C:\\',
    'D:\\',
    'C:\\Windows',
    'C:\\Program Files',
    'C:\\Program Files (x86)',
    'C:\\ProgramData',
    'C:\\Users',
    'C:\\Users\\Alice',
    'C:\\Users\\Alice\\AppData',
    'C:\\Users\\Alice\\AppData\\Local',
    'C:\\Users\\Alice\\AppData\\Roaming'
  ])('%s is a container', (p) => expect(isContainerFolder(p)).toBe(true))

  it.each([
    'C:\\Users\\Alice\\Documents',
    'C:\\Users\\Alice\\Desktop',
    'C:\\Users\\Alice\\OneDrive',
    'C:\\Users\\Alice\\AppData\\Local\\Temp',
    'C:\\Users\\Alice\\AppData\\Local\\Google',
    'C:\\Windows\\System32',
    'C:\\Games',
    'C:\\Program Files\\Git'
  ])('%s is scanned whole', (p) => expect(isContainerFolder(p)).toBe(false))
})
