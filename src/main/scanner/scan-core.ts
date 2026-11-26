import { promises as fsp, type Dirent, type Stats } from 'node:fs'
import { basename, join, parse } from 'node:path'
import type { FolderMetadata, ScanProgress } from '../../shared/types'

export const MAX_SAMPLE_NAMES = 30
export const MAX_EXTENSIONS = 50
const STAT_BATCH = 64
const PROGRESS_INTERVAL_MS = 100

/** The only filesystem calls the scanner makes. None of them read file contents. */
export interface ScanFs {
  readdir: (path: string) => Promise<Dirent[]>
  lstat: (path: string) => Promise<Stats>
}

const realFs: ScanFs = {
  readdir: (p) => fsp.readdir(p, { withFileTypes: true }),
  lstat: (p) => fsp.lstat(p)
}

export interface ScanOptions {
  isCancelled?: () => boolean
  onProgress?: (p: ScanProgress) => void
  fs?: ScanFs
}

export class ScanCancelledError extends Error {
  constructor() {
    super('Scan cancelled')
    this.name = 'ScanCancelledError'
  }
}

export function extOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  // No dot, a dotfile like ".gitignore", or a trailing dot -> no extension
  if (dot <= 0 || dot === fileName.length - 1) return '(none)'
  return fileName.slice(dot).toLowerCase()
}

/**
 * Walks a folder and collects metadata only. Never opens or reads a file.
 * Symlinks and junctions are not followed. Unreadable entries are counted, not fatal.
 * Throws if the root itself is not a readable directory, or ScanCancelledError on cancel.
 */
export async function scanFolder(root: string, options: ScanOptions = {}): Promise<FolderMetadata> {
  const fs = options.fs ?? realFs
  const isCancelled = options.isCancelled ?? (() => false)

  const rootStat = await fs.lstat(root).catch(() => {
    throw new Error('Folder not found or not accessible')
  })
  if (!rootStat.isDirectory()) throw new Error('Not a folder')

  let sizeBytes = 0
  let fileCount = 0
  let dirCount = 0
  let unreadableCount = 0
  let linksSkipped = 0
  let oldest = Infinity
  let newest = -Infinity
  const extCounts = new Map<string, number>()
  const samples: string[] = []

  let lastProgress = 0
  const reportProgress = (currentPath: string, force = false): void => {
    if (!options.onProgress) return
    const now = Date.now()
    if (!force && now - lastProgress < PROGRESS_INTERVAL_MS) return
    lastProgress = now
    options.onProgress({ currentPath, filesScanned: fileCount, bytesScanned: sizeBytes })
  }

  // Breadth-first so sample names come from shallow levels first.
  let queue: string[] = [root]
  while (queue.length > 0) {
    const next: string[] = []
    for (const dir of queue) {
      if (isCancelled()) throw new ScanCancelledError()

      let entries: Dirent[]
      try {
        entries = await fs.readdir(dir)
      } catch {
        // An unreadable root is a real error; unreadable subfolders are just counted.
        if (dir === root) throw new Error('Cannot read this folder (access denied or it no longer exists)')
        unreadableCount++
        continue
      }

      const files: Dirent[] = []
      for (const entry of entries) {
        if (entry.isSymbolicLink()) linksSkipped++
        else if (entry.isDirectory()) {
          dirCount++
          next.push(join(dir, entry.name))
        } else if (entry.isFile()) files.push(entry)
        // sockets, devices etc. are ignored
      }

      for (let i = 0; i < files.length; i += STAT_BATCH) {
        if (isCancelled()) throw new ScanCancelledError()
        const batch = files.slice(i, i + STAT_BATCH)
        const stats = await Promise.all(batch.map((f) => fs.lstat(join(dir, f.name)).catch(() => null)))
        batch.forEach((f, idx) => {
          const st = stats[idx]
          if (!st) {
            unreadableCount++
            return
          }
          fileCount++
          sizeBytes += st.size
          if (st.mtimeMs < oldest) oldest = st.mtimeMs
          if (st.mtimeMs > newest) newest = st.mtimeMs
          const ext = extOf(f.name)
          extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1)
          if (samples.length < MAX_SAMPLE_NAMES) samples.push(f.name)
        })
      }
      reportProgress(dir)
    }
    queue = next
  }

  reportProgress(root, true)

  const extensionCounts = Object.fromEntries(
    [...extCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_EXTENSIONS)
  )
  const iso = (ms: number): string | null => (Number.isFinite(ms) ? new Date(ms).toISOString() : null)

  return {
    path: root,
    // basename of a drive root like C:\ is empty, so fall back to the root itself
    name: basename(root) || parse(root).root,
    sizeBytes,
    fileCount,
    dirCount,
    extensionCounts,
    createdAt: iso(rootStat.birthtimeMs),
    modifiedAt: iso(rootStat.mtimeMs),
    oldestFileAt: iso(oldest),
    newestFileAt: iso(newest),
    sampleFileNames: samples,
    unreadableCount,
    linksSkipped
  }
}
