import type { ScannedFolder } from '../hooks/useScanner'
import { formatBytes, shortenPath } from '../lib/format'
import VerdictBadge from './VerdictBadge'

interface Props {
  items: ScannedFolder[]
  selectedPath: string | null
  onSelect: (path: string) => void
}

/** Results ranked by size, biggest first. The bar shows size relative to the biggest. */
export default function ResultsList({ items, selectedPath, onSelect }: Props): React.JSX.Element {
  const ranked = [...items].sort((a, b) => b.metadata.sizeBytes - a.metadata.sizeBytes)
  const max = Math.max(1, ...ranked.map((i) => i.metadata.sizeBytes))

  return (
    <ul className="flex flex-col gap-0.5" aria-label="Scanned folders, largest first">
      {ranked.map(({ metadata: m, explanation: e }) => {
        const selected = m.path === selectedPath
        return (
          <li key={m.path}>
            <button
              onClick={() => onSelect(m.path)}
              aria-current={selected}
              className={`w-full rounded-lg border p-3 text-left transition-colors duration-150 ease-out-soft ${
                selected ? 'border-zinc-200 bg-zinc-100' : 'border-transparent hover:bg-zinc-50'
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium">{m.name}</span>
                <span className="shrink-0 font-mono text-sm tabular-nums text-zinc-900">{formatBytes(m.sizeBytes)}</span>
              </div>
              <p className="mt-1 truncate font-mono text-xs text-zinc-500" title={m.path}>
                {shortenPath(m.path, 34)}
              </p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-200">
                <div
                  className="h-full rounded-full bg-zinc-500"
                  style={{ width: `${Math.max(2, (m.sizeBytes / max) * 100)}%` }}
                />
              </div>
              <div className="mt-2">
                <VerdictBadge verdict={e?.verdict ?? null} />
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
