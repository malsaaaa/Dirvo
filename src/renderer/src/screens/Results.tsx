import DetailCard from '../components/DetailCard'
import ResultsList from '../components/ResultsList'
import type { ScannedFolder } from '../hooks/useScanner'

interface Props {
  items: ScannedFolder[]
  selectedPath: string | null
  onSelect: (path: string) => void
  onClear: () => void
  onGoPick: () => void
}

export default function Results({ items, selectedPath, onSelect, onClear, onGoPick }: Props): React.JSX.Element {
  if (items.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 p-16 text-center">
        <p className="text-lg font-medium">No results yet</p>
        <p className="text-sm text-slate-600">Scan a folder and its explanation will show up here.</p>
        <button onClick={onGoPick} className="mt-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
          Explain a folder
        </button>
      </div>
    )
  }

  const selected = items.find((i) => i.metadata.path === selectedPath) ?? items[0]

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-80 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-sm font-semibold">Results · {items.length}</h1>
          <button onClick={onClear} className="text-xs text-slate-500 hover:text-slate-800">
            Clear list
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          <ResultsList items={items} selectedPath={selected.metadata.path} onSelect={onSelect} />
        </div>
      </aside>
      <section className="min-w-0 flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-2xl">
          <DetailCard key={selected.metadata.path} item={selected} />
        </div>
      </section>
    </div>
  )
}
