import { promises as fsp, type Dirent, type Stats } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { FolderMetadata } from '../../shared/types'
import { isLockedError, type LockedStatFn } from './locked-files'
import { extOf } from './scan-core'

/** The only filesystem call used to look at one file. It never opens or reads the file. */
export interface FileFs {
  lstat: (path: string) => Promise<Stats>
}

const realFs: FileFs = { lstat: (p) => fsp.lstat(p) }

const iso = (ms: number): string | null => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null)

/** Describes a file with the same fields as a folder, so it can sit in the same list. */
export function fileMetadata(path: string, stat: Pick<Stats, 'size' | 'mtimeMs' | 'birthtimeMs'>): FolderMetadata {
  const modifiedAt = iso(stat.mtimeMs)
  return {
    kind: 'file',
    path,
    name: basename(path),
    sizeBytes: stat.size,
    fileCount: 1,
    dirCount: 0,
    extensionCounts: { [extOf(basename(path))]: 1 },
    createdAt: iso(stat.birthtimeMs),
    modifiedAt,
    oldestFileAt: modifiedAt,
    newestFileAt: modifiedAt,
    sampleFileNames: [],
    unreadableCount: 0,
    linksSkipped: 0
  }
}

export type InspectResult =
  | { status: 'file'; metadata: FolderMetadata }
  | { status: 'folder' }
  | { status: 'error'; message: string }

/**
 * Looks at one path with lstat only. Links are not followed, and nothing is read from the file.
 * A folder is reported as 'folder' so the caller can scan it the usual way.
 */
export async function inspectFile(path: string, fs: FileFs = realFs, locked?: LockedStatFn): Promise<InspectResult> {
  let stat: Stats
  try {
    stat = await fs.lstat(path)
  } catch (err) {
    if (isLockedError(err)) {
      // Windows keeps some files (pagefile.sys, hiberfil.sys) locked; their folder listing still has the size.
      const found = locked ? (await locked(dirname(path), [basename(path)])).get(basename(path).toLowerCase()) : undefined
      if (found) return { status: 'file', metadata: fileMetadata(path, found) }
      return { status: 'error', message: 'Windows has this file locked, so Dirvo cannot read its size' }
    }
    return { status: 'error', message: 'That file was not found or cannot be read' }
  }
  if (stat.isDirectory()) return { status: 'folder' }
  if (stat.isSymbolicLink()) return { status: 'error', message: 'That is a link, not a file. Dirvo does not follow links' }
  if (!stat.isFile()) return { status: 'error', message: 'That is not an ordinary file' }
  return { status: 'file', metadata: fileMetadata(path, stat) }
}

/** The filesystem calls needed to list the files in one folder. Still no reading of file contents. */
export interface ListFs extends FileFs {
  readdir: (path: string) => Promise<Dirent[]>
}

const realListFs: ListFs = { lstat: (p) => fsp.lstat(p), readdir: (p) => fsp.readdir(p, { withFileTypes: true }) }

/**
 * Files directly inside `dir` (not in its subfolders) that are `minBytes` or bigger, biggest first.
 * Links are skipped. Throws if the folder cannot be read; a file that vanishes mid-scan is skipped.
 */
export async function listBigFiles(
  dir: string,
  minBytes: number,
  fs: ListFs = realListFs,
  locked?: LockedStatFn
): Promise<FolderMetadata[]> {
  const entries = await fs.readdir(dir)
  const found: FolderMetadata[] = []
  const lockedNames: string[] = []
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) continue
    const full = join(dir, entry.name)
    try {
      const stat = await fs.lstat(full)
      if (stat.isFile() && stat.size >= minBytes) found.push(fileMetadata(full, stat))
    } catch (err) {
      if (isLockedError(err)) lockedNames.push(entry.name)
    }
  }
  // The files Windows keeps locked, such as pagefile.sys: read their sizes from the folder listing instead.
  if (locked && lockedNames.length > 0) {
    const sizes = await locked(dir, lockedNames)
    for (const name of lockedNames) {
      const st = sizes.get(name.toLowerCase())
      if (st && st.size >= minBytes) found.push(fileMetadata(join(dir, name), st))
    }
  }
  return found.sort((a, b) => b.sizeBytes - a.sizeBytes)
}
