import type { ScannedFolder, SizeSnapshot } from '@shared/types'
import { buildForest, normPath } from './tree'

/** Latest known size of every folder ever scanned, by lower-cased path. */
export type History = Record<string, SizeSnapshot>

/** Changes smaller than this are treated as noise (files come and go all the time). */
export const MIN_CHANGE_BYTES = 1024 * 1024
export const MAX_HISTORY = 5000

/**
 * Records a fresh scan. Returns the size from the scan before it (if any) and the updated history.
 * Never changes the history it is given. If the history grows past the cap, the oldest entries go.
 */
export function recordScan(
  history: History,
  path: string,
  sizeBytes: number,
  scannedAt: string
): { previous: SizeSnapshot | undefined; history: History } {
  const key = normPath(path)
  const before = history[key]
  const next: History = { ...history, [key]: { sizeBytes, scannedAt } }

  const keys = Object.keys(next)
  if (keys.length > MAX_HISTORY) {
    keys
      .sort((a, b) => Date.parse(next[a].scannedAt) - Date.parse(next[b].scannedAt))
      .slice(0, keys.length - MAX_HISTORY)
      .forEach((k) => delete next[k])
  }
  // The same scan seen twice is not a change.
  return { previous: before && before.scannedAt !== scannedAt ? before : undefined, history: next }
}

export interface Delta {
  bytes: number
  /** When the earlier size was measured. */
  since: string
}

/** How much a folder changed since the scan before this one. Null when unknown or too small to matter. */
export function deltaOf(item: ScannedFolder): Delta | null {
  if (!item.previous) return null
  const bytes = item.metadata.sizeBytes - item.previous.sizeBytes
  return Math.abs(bytes) < MIN_CHANGE_BYTES ? null : { bytes, since: item.previous.scannedAt }
}

export interface Changes {
  /** Net change across the results that were scanned before. */
  bytes: number
  /** Folders that changed by more than the noise limit. */
  changed: number
  /** The oldest earlier scan being compared against. */
  since: string
}

/**
 * The net change since the last scan, over results that were scanned before. Only top-level results
 * count: a folder inside another listed folder is already part of its parent's size.
 */
export function changesSince(items: ScannedFolder[]): Changes | null {
  let bytes = 0
  let changed = 0
  let since: string | null = null
  let compared = 0

  for (const root of buildForest(items)) {
    const prev = root.item.previous
    if (!prev) continue
    compared++
    const d = root.item.metadata.sizeBytes - prev.sizeBytes
    bytes += d
    if (Math.abs(d) >= MIN_CHANGE_BYTES) changed++
    if (since === null || Date.parse(prev.scannedAt) < Date.parse(since)) since = prev.scannedAt
  }
  if (compared === 0 || since === null || Math.abs(bytes) < MIN_CHANGE_BYTES) return null
  return { bytes, changed, since }
}

/** First and last scan dates among the results, for "Scanned Nov 12 to Nov 26". */
export function scanSpan(items: ScannedFolder[]): { first: string; last: string } | null {
  let first: string | null = null
  let last: string | null = null
  for (const i of items) {
    const t = Date.parse(i.scannedAt)
    if (Number.isNaN(t)) continue
    if (first === null || t < Date.parse(first)) first = i.scannedAt
    if (last === null || t > Date.parse(last)) last = i.scannedAt
  }
  return first && last ? { first, last } : null
}
