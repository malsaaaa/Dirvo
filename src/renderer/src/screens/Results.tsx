import Button from '../components/Button'
import DetailCard from '../components/DetailCard'
import ReclaimBand from '../components/ReclaimBand'
import ResultsList from '../components/ResultsList'
import type { BreakdownControls } from '../hooks/useDriveScan'
import type { ScannedFolder } from '../hooks/useScanner'
import { formatCount } from '../lib/format'
import { summarize } from '../lib/summary'

interface Props {
  items: ScannedFolder[]
  selectedPath: string | null
  onSelect: (path: string) => void
  onClear: () => void
  onGoPick: () => void
  onRetryAi: (path: string) => void
  onOpenSettings: () => void
  breakdown: BreakdownControls
  /** One line about where the results came from, e.g. the last drive scan. */
  note?: string | null
}

export default function Results({
  items,
  selectedPath,
  onSelect,
  onClear,
  onGoPick,
  onRetryAi,
  onOpenSettings,
  breakdown,
  note
}: Props): React.JSX.Element {
  if (items.length === 0) {
    return (
      <div className="flex max-w-md flex-col items-start gap-2 p-8">
        <h1 className="text-3xl font-medium">Results</h1>
        <p className="text-ink-2">Scan a folder or a drive and its explanation will show up here.</p>
        <Button variant="primary" onClick={onGoPick} className="mt-4">
          Explain a folder
        </Button>
      </div>
    )
  }

  // With nothing selected, show the biggest folder (the ledger is ranked by size).
  const biggest = items.reduce((a, b) => (b.metadata.sizeBytes > a.metadata.sizeBytes ? b : a))
  const selected = items.find((i) => i.metadata.path === selectedPath) ?? biggest

  return (
    <div className="flex h-full min-h-0 flex-col">
      {items.length > 1 && <ReclaimBand summary={summarize(items)} note={note} />}

      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-14 shrink-0 items-center justify-between pl-4 pr-3">
            <h1 className="text-sm font-medium">
              Folders <span className="font-mono tabular-nums text-ink-3">{formatCount(items.length)}</span>
              <span className="text-ink-3"> · largest first</span>
            </h1>
            <Button variant="ghost" onClick={onClear} className="h-8 text-xs">
              Clear list
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ResultsList items={items} selectedPath={selected.metadata.path} onSelect={onSelect} />
          </div>
        </section>

        <aside className="w-96 shrink-0 overflow-y-auto border-l border-line bg-surface p-6">
          <DetailCard
            key={selected.metadata.path}
            item={selected}
            onRetryAi={() => onRetryAi(selected.metadata.path)}
            onOpenSettings={onOpenSettings}
            breakdown={breakdown}
          />
        </aside>
      </div>
    </div>
  )
}
