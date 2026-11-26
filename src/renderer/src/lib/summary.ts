import type { ScannedFolder } from '@shared/types'
import { buildForest, type ForestNode } from './tree'
import { BUCKET_ORDER, type Bucket } from './verdict'

export interface Summary {
  /** Folders listed. */
  count: number
  totalBytes: number
  /** Space in folders rated Safe to delete or Rebuilds automatically. */
  reclaimableBytes: number
  reclaimableCount: number
  byBucket: Record<Bucket, { bytes: number; count: number }>
}

/**
 * Totals for the reclaim band. Results can contain each other (a folder and the folders found when
 * you "looked inside" it), so each folder is counted only for the space the folders listed inside it
 * do not already account for. Looking inside a 93 GB unknown folder and finding a 20 GB rebuildable
 * cache gives 20 GB reclaimable and 73 GB unknown, never 113 GB.
 */
export function summarize(items: ScannedFolder[]): Summary {
  const byBucket = Object.fromEntries(BUCKET_ORDER.map((b) => [b, { bytes: 0, count: 0 }])) as Summary['byBucket']
  let totalBytes = 0

  const visit = (node: ForestNode): void => {
    const size = node.item.metadata.sizeBytes
    const insideListed = node.children.reduce((sum, c) => sum + c.item.metadata.sizeBytes, 0)
    // If the listed children add up to more than the parent (files changed between scans), count none of it twice.
    const own = Math.max(0, size - insideListed)
    const bucket: Bucket = node.item.explanation?.verdict ?? 'UNKNOWN'
    byBucket[bucket].bytes += own
    byBucket[bucket].count++
    totalBytes += own
    node.children.forEach(visit)
  }
  buildForest(items).forEach(visit)

  const safe = byBucket.SAFE
  const rebuilds = byBucket.REBUILDS_AUTOMATICALLY
  return {
    count: items.length,
    totalBytes,
    reclaimableBytes: safe.bytes + rebuilds.bytes,
    reclaimableCount: safe.count + rebuilds.count,
    byBucket
  }
}
