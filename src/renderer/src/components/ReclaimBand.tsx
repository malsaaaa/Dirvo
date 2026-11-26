import { ArrowDown, ArrowUp } from 'lucide-react'
import { formatBytes, formatCount, formatDate, formatDateTime, formatDelta } from '../lib/format'
import type { Changes } from '../lib/history'
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

interface BandProps {
  summary: Summary
  note?: string | null
  /** Net change since the last scan of the same folders, if any were scanned before. */
  change?: Changes | null
  /** First and last scan dates among the results. */
  span?: { first: string; last: string } | null
}

/**
 * The one rich moment on the results screen: how much space could come back, and where all the
 * scanned space sits, split by verdict. Also shows when it was scanned and what changed since before.
 */
export default function ReclaimBand({ summary, note, change, span }: BandProps): React.JSX.Element {
  const { reclaimableBytes, reclaimableCount, totalBytes, byBucket, count, idleReclaimableBytes } = summary
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
      {idleReclaimableBytes > 0 && (
        <p className="mt-1 text-sm text-ink-2">
          <span className="font-mono tabular-nums">{formatBytes(idleReclaimableBytes)}</span> of it is in folders nothing has touched for over a
          year.
        </p>
      )}
      {span && (
        <p className="mt-1 text-sm text-ink-3">
          {Date.parse(span.last) - Date.parse(span.first) > 24 * 60 * 60 * 1000
            ? `Scanned ${formatDate(span.first)} to ${formatDate(span.last)}`
            : `Scanned ${formatDateTime(span.last)}`}
        </p>
      )}
      {change && (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-ink-2">
          {change.bytes > 0 ? <ArrowUp size={14} strokeWidth={1.5} aria-hidden /> : <ArrowDown size={14} strokeWidth={1.5} aria-hidden />}
          Since {formatDateTime(change.since)}:
          <span className="font-mono font-medium tabular-nums text-ink">{formatDelta(change.bytes)}</span>
          {change.changed > 0 && (
            <span className="text-ink-3">
              across {formatCount(change.changed)} changed folder{change.changed === 1 ? '' : 's'}
            </span>
          )}
        </p>
      )}

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
