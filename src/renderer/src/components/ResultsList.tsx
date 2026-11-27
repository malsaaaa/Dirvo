import { useEffect, useRef } from 'react'
import { ArrowDown, ArrowUp, CornerDownRight, File } from 'lucide-react'
import { formatBytes, formatDelta, shortenPath } from '../lib/format'
import { idleDays, idleLabel } from '../lib/age'
import { deltaOf } from '../lib/history'
import type { LedgerRow } from '../lib/tree'
import VerdictBadge from './VerdictBadge'

interface Props {
  rows: LedgerRow[]
  /** Size of the biggest result overall, for the share rule along each row. */
  maxBytes: number
  selectedPath: string | null
  onSelect: (path: string) => void
  label: string
}

const COLUMNS = 'grid grid-cols-[minmax(0,1fr)_72px_104px] items-center gap-4'
const INDENT_PX = 20

/**
 * A ledger: one row per folder or file. Without a search or filter, folders found by "look inside" sit directly
 * under their parent, indented. A thin rule along the bottom of each row
 * shows its share of the biggest folder.
 */
export default function ResultsList({ rows, maxBytes, selectedPath, onSelect, label }: Props): React.JSX.Element {
  const max = Math.max(1, maxBytes)
  const table = useRef<HTMLDivElement>(null)

  // Moving with the keyboard must never leave the selection off screen.
  useEffect(() => {
    table.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selectedPath])

  return (
    <div ref={table} role="table" aria-label={label}>
      <div role="row" className={`${COLUMNS} sticky top-0 z-10 border-b border-line bg-page px-4 py-2 text-xs text-ink-3`}>
        <span role="columnheader">Name</span>
        <span role="columnheader" className="text-right">
          Size
        </span>
        <span role="columnheader">Ruling</span>
      </div>
      {rows.map(({ item, depth }) => {
        const { metadata: m, explanation: e } = item
        const delta = deltaOf(item)
        const idle = idleLabel(idleDays(item))
        const isFile = m.kind === 'file'
        const selected = m.path === selectedPath
        return (
          <button
            key={m.path}
            role="row"
            aria-level={depth + 1}
            onClick={() => onSelect(m.path)}
            aria-current={selected}
            className={`${COLUMNS} relative w-full scroll-mt-10 border-b border-line px-4 py-3 text-left transition-colors duration-150 ease-out-soft ${
              selected ? 'bg-raised' : 'hover:bg-hover'
            }`}
          >
            {/* Share of the biggest folder, as a thin rule along the bottom of the row. */}
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-0 left-0 h-0.5 bg-line-strong"
              style={{ width: `${Math.max(1, (m.sizeBytes / max) * 100)}%` }}
            />
            {selected && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-ink" />}
            <span role="cell" className="relative flex min-w-0 items-start gap-1.5" style={{ paddingLeft: depth * INDENT_PX }}>
              {depth > 0 && <CornerDownRight size={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />}
              {isFile && <File size={13} strokeWidth={1.5} className="mt-1 shrink-0 text-ink-3" aria-label="File" />}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{m.name}</span>
                <span className="mt-0.5 block truncate font-mono text-xs text-ink-3" title={m.path}>
                  {e?.createdBy ? `${e.createdBy} · ` : ''}
                  {shortenPath(m.path, depth > 0 ? 34 : 40)}
                </span>
              </span>
            </span>
            <span role="cell" className="relative text-right font-mono tabular-nums">
              <span className="block text-sm">{formatBytes(m.sizeBytes)}</span>
              {delta && (
                <span
                  className="mt-0.5 flex items-center justify-end gap-0.5 text-xs text-ink-3"
                  title={`${formatDelta(delta.bytes)} since the scan on ${new Date(delta.since).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                >
                  {delta.bytes > 0 ? <ArrowUp size={11} strokeWidth={1.5} aria-hidden /> : <ArrowDown size={11} strokeWidth={1.5} aria-hidden />}
                  {formatDelta(delta.bytes).slice(1)}
                </span>
              )}
            </span>
            <span role="cell" className="relative">
              <VerdictBadge verdict={e?.verdict ?? null} short />
              {idle && (
                <span className="mt-0.5 block font-mono text-xs text-ink-3" title={isFile ? `Not changed for ${idle.long}` : `Nothing in it has changed for ${idle.long}`}>
                  idle {idle.short}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
