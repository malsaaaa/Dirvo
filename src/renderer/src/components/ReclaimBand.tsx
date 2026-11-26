import { formatBytes, formatCount } from '../lib/format'
import type { Summary } from '../lib/summary'
import { BUCKET_ORDER, UNKNOWN_STYLE, VERDICT_STYLE, type Bucket } from '../lib/verdict'

const BUCKET_LABEL: Record<Bucket, string> = {
  SAFE: VERDICT_STYLE.SAFE.short,
  REBUILDS_AUTOMATICALLY: VERDICT_STYLE.REBUILDS_AUTOMATICALLY.short,
  CAUTION: VERDICT_STYLE.CAUTION.short,
  DONT_TOUCH: VERDICT_STYLE.DONT_TOUCH.short,
  UNKNOWN: UNKNOWN_STYLE.short
}
const BUCKET_DOT: Record<Bucket, string> = {
  SAFE: VERDICT_STYLE.SAFE.dot,
  REBUILDS_AUTOMATICALLY: VERDICT_STYLE.REBUILDS_AUTOMATICALLY.dot,
  CAUTION: VERDICT_STYLE.CAUTION.dot,
  DONT_TOUCH: VERDICT_STYLE.DONT_TOUCH.dot,
  UNKNOWN: UNKNOWN_STYLE.dot
}

/**
 * The one rich moment on the results screen: how much space could come back, and where all the
 * scanned space sits, split by verdict.
 */
export default function ReclaimBand({ summary, note }: { summary: Summary; note?: string | null }): React.JSX.Element {
  const { reclaimableBytes, reclaimableCount, totalBytes, byBucket, count } = summary
  const parts = BUCKET_ORDER.filter((b) => byBucket[b].bytes > 0)
  const label = parts.map((b) => `${BUCKET_LABEL[b]} ${formatBytes(byBucket[b].bytes)}`).join(', ')

  return (
    <section className="shrink-0 border-b border-line px-8 py-6" aria-label="Reclaimable space">
      <p className="text-sm text-ink-3">Reclaimable space</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <span className="font-mono text-5xl font-medium tabular-nums">{formatBytes(reclaimableBytes)}</span>
        <span className="text-lg text-ink-2">can be reclaimed</span>
      </div>
      <p className="mt-2 text-sm text-ink-3">
        {reclaimableCount > 0
          ? `In ${formatCount(reclaimableCount)} of ${formatCount(count)} folders rated Safe or Rebuilds. Check each one before you delete. `
          : `None of the ${formatCount(count)} folders is rated Safe or Rebuilds. `}
        {note}
      </p>

      <div
        role="img"
        aria-label={`Where ${formatBytes(totalBytes)} goes: ${label}`}
        className="animate-grow mt-5 flex h-3 gap-0.5 overflow-hidden rounded-md"
      >
        {parts.map((b) => (
          <span
            key={b}
            className={`${BUCKET_DOT[b]} min-w-0.5 rounded-sm`}
            style={{ width: `${(byBucket[b].bytes / totalBytes) * 100}%` }}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-ink-2">
        {parts.map((b) => (
          <li key={b} className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${BUCKET_DOT[b]}`} />
            {BUCKET_LABEL[b]}
            <span className="font-mono tabular-nums text-ink-3">{formatBytes(byBucket[b].bytes)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
