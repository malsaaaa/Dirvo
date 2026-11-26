import type { ScannedFolder } from '@shared/types'
import { BUCKET_ORDER, type Bucket } from './verdict'

export interface Summary {
  /** Folders counted (folders inside another listed folder are left out so nothing is counted twice). */
  count: number
  totalBytes: number
  /** Folders rated Safe to delete or Rebuilds automatically. */
  reclaimableBytes: number
  reclaimableCount: number
  byBucket: Record<Bucket, { bytes: number; count: number }>
}

function norm(path: string): string {
  return path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

/**
 * Totals for the reclaim band. Results can overlap (a drive scan lists AppData\Local\Temp, and you
 * may also have scanned a folder inside it), so a folder that sits inside another listed folder is
 * left out: the outer one already includes its size.
 */
export function summarize(items: ScannedFolder[]): Summary {
  const paths = items.map((i) => norm(i.metadata.path))
  const byBucket = Object.fromEntries(BUCKET_ORDER.map((b) => [b, { bytes: 0, count: 0 }])) as Summary['byBucket']
  let count = 0
  let totalBytes = 0

  items.forEach((item, i) => {
    const nested = paths.some((other, j) => j !== i && paths[i].startsWith(other + '\\'))
    if (nested) return
    const bucket: Bucket = item.explanation?.verdict ?? 'UNKNOWN'
    byBucket[bucket].bytes += item.metadata.sizeBytes
    byBucket[bucket].count++
    totalBytes += item.metadata.sizeBytes
    count++
  })

  const safe = byBucket.SAFE
  const rebuilds = byBucket.REBUILDS_AUTOMATICALLY
  return {
    count,
    totalBytes,
    reclaimableBytes: safe.bytes + rebuilds.bytes,
    reclaimableCount: safe.count + rebuilds.count,
    byBucket
  }
}
