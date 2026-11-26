import { Search, X } from 'lucide-react'
import { FILTER_LABELS, FILTER_ORDER, SORT_LABELS, type FilterKey, type LedgerView, type SortKey } from '../lib/ledger-view'
import { formatCount } from '../lib/format'
import { INPUT_CLASS } from './Button'

interface Props {
  view: LedgerView
  onChange: (view: LedgerView) => void
  /** How many folders each chip would show with the current search. */
  counts: Record<FilterKey, number>
  /** Folders idle for a year or more, among the searched ones. */
  idleCount: number
  /** Lets the app focus the search box (the / shortcut). */
  inputRef?: React.Ref<HTMLInputElement>
}

/** Search, filter chips and sort for the results ledger. */
export default function LedgerToolbar({ view, onChange, counts, idleCount, inputRef }: Props): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 px-4 pb-3">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            value={view.query}
            onChange={(ev) => onChange({ ...view, query: ev.target.value })}
            onKeyDown={(ev) => {
              if (ev.key === 'Escape') {
                ev.preventDefault()
                // First Esc clears the search; a second one leaves the box so the letter shortcuts work again.
                if (view.query) onChange({ ...view, query: '' })
                else ev.currentTarget.blur()
              }
            }}
            placeholder="Search name, path or maker"
            aria-label="Search folders"
            spellCheck={false}
            autoComplete="off"
            className={`${INPUT_CLASS} w-full pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden`}
          />
          {view.query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onChange({ ...view, query: '' })}
              className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-3 transition-colors duration-150 ease-out-soft hover:bg-raised hover:text-ink"
            >
              <X size={14} strokeWidth={1.5} aria-hidden />
            </button>
          )}
        </div>
        <select
          aria-label="Sort"
          value={view.sort}
          onChange={(ev) => onChange({ ...view, sort: ev.target.value as SortKey })}
          className={`${INPUT_CLASS} w-44 flex-none`}
        >
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      <div role="group" aria-label="Filter by ruling" className="flex flex-wrap gap-1">
        {FILTER_ORDER.map((k) => {
          const on = view.filter === k
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => onChange({ ...view, filter: k })}
              className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors duration-150 ease-out-soft ${
                on ? 'border-line-strong bg-raised text-ink' : 'border-transparent text-ink-2 hover:bg-hover hover:text-ink'
              }`}
            >
              {FILTER_LABELS[k]}
              <span className="font-mono tabular-nums text-ink-3">{formatCount(counts[k])}</span>
            </button>
          )
        })}
        <button
          type="button"
          aria-pressed={view.idleOnly}
          onClick={() => onChange({ ...view, idleOnly: !view.idleOnly })}
          title="Folders where nothing has changed for a year or more"
          className={`ml-auto inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors duration-150 ease-out-soft ${
            view.idleOnly ? 'border-line-strong bg-raised text-ink' : 'border-transparent text-ink-2 hover:bg-hover hover:text-ink'
          }`}
        >
          Idle 1y+
          <span className="font-mono tabular-nums text-ink-3">{formatCount(idleCount)}</span>
        </button>
      </div>
    </div>
  )
}
