import Button from '../components/Button'
import DetailCard from '../components/DetailCard'
import ResultsList from '../components/ResultsList'
import type { ScannedFolder } from '../hooks/useScanner'

interface Props {
  items: ScannedFolder[]
  selectedPath: string | null
  onSelect: (path: string) => void
  onClear: () => void
  onGoPick: () => void
  onRetryAi: (path: string) => void
  onOpenSettings: () => void
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
  note
}: Props): React.JSX.Element {
  if (items.length === 0) {
    return (
      <div className="flex max-w-md flex-col items-start gap-2 p-8">
        <h1 className="text-3xl font-medium">Results</h1>
        <p className="text-zinc-600">Scan a folder or a drive and its explanation will show up here.</p>
        <Button variant="primary" onClick={onGoPick} className="mt-4">
          Explain a folder
        </Button>
      </div>
    )
  }

  // With nothing selected, show the biggest folder (the list is ranked by size).
  const biggest = items.reduce((a, b) => (b.metadata.sizeBytes > a.metadata.sizeBytes ? b : a))
  const selected = items.find((i) => i.metadata.path === selectedPath) ?? biggest

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-80 shrink-0 flex-col border-r border-zinc-200 bg-white">
        <div className="flex h-14 items-center justify-between pl-4 pr-3">
          <h1 className="text-sm font-medium">
            Results <span className="font-mono tabular-nums text-zinc-500">{items.length}</span>
          </h1>
          <Button variant="ghost" onClick={onClear} className="h-8 text-xs">
            Clear list
          </Button>
        </div>
        {note && <p className="px-4 pb-3 text-xs text-zinc-500">{note}</p>}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          <ResultsList items={items} selectedPath={selected.metadata.path} onSelect={onSelect} />
        </div>
      </aside>
      <section className="min-w-0 flex-1 overflow-y-auto p-8">
        <div className="max-w-3xl">
          <DetailCard
            key={selected.metadata.path}
            item={selected}
            onRetryAi={() => onRetryAi(selected.metadata.path)}
            onOpenSettings={onOpenSettings}
          />
        </div>
      </section>
    </div>
  )
}
