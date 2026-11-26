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
    <ul className="flex flex-col gap-1" aria-label="Scanned folders, largest first">
      {ranked.map(({ metadata: m, explanation: e }) => {
        const selected = m.path === selectedPath
        return (
          <li key={m.path}>
            <button
              onClick={() => onSelect(m.path)}
              aria-current={selected}
              className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                selected ? 'border-indigo-300 bg-indigo-50' : 'border-transparent hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{m.name}</span>
                <span className="shrink-0 text-sm tabular-nums text-slate-700">{formatBytes(m.sizeBytes)}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-500" title={m.path}>
                {shortenPath(m.path, 44)}
              </p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-slate-400"
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
