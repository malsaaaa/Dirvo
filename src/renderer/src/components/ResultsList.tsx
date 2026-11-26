import type { ScannedFolder } from '../hooks/useScanner'
import { formatBytes, shortenPath } from '../lib/format'
import VerdictBadge from './VerdictBadge'

interface Props {
  items: ScannedFolder[]
  selectedPath: string | null
  onSelect: (path: string) => void
}

const COLUMNS = 'grid grid-cols-[minmax(0,1fr)_72px_104px] items-center gap-4'

/** A ledger: one row per folder, ranked by size. A faint bar behind each row shows its share of the biggest. */
export default function ResultsList({ items, selectedPath, onSelect }: Props): React.JSX.Element {
  const ranked = [...items].sort((a, b) => b.metadata.sizeBytes - a.metadata.sizeBytes)
  const max = Math.max(1, ...ranked.map((i) => i.metadata.sizeBytes))

  return (
    <div role="table" aria-label="Scanned folders, largest first">
      <div role="row" className={`${COLUMNS} sticky top-0 z-10 border-b border-line bg-page px-4 py-2 text-xs text-ink-3`}>
        <span role="columnheader">Folder</span>
        <span role="columnheader" className="text-right">
          Size
        </span>
        <span role="columnheader">Ruling</span>
      </div>
      {ranked.map(({ metadata: m, explanation: e }) => {
        const selected = m.path === selectedPath
        return (
          <button
            key={m.path}
            role="row"
            onClick={() => onSelect(m.path)}
            aria-current={selected}
            className={`${COLUMNS} relative w-full border-b border-line px-4 py-3 text-left transition-colors duration-150 ease-out-soft ${
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
            <span role="cell" className="relative min-w-0">
              <span className="block truncate text-sm font-medium">{m.name}</span>
              <span className="mt-0.5 block truncate font-mono text-xs text-ink-3" title={m.path}>
                {e?.createdBy ? `${e.createdBy} · ` : ''}
                {shortenPath(m.path, 40)}
              </span>
            </span>
            <span role="cell" className="relative text-right font-mono text-sm tabular-nums">
              {formatBytes(m.sizeBytes)}
            </span>
            <span role="cell" className="relative">
              <VerdictBadge verdict={e?.verdict ?? null} short />
            </span>
          </button>
        )
      })}
    </div>
  )
}
