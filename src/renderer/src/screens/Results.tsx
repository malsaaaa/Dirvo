import { useState } from 'react'
import { Download } from 'lucide-react'
import Button from '../components/Button'
import DetailCard from '../components/DetailCard'
import ExportDialog, { type ExportChoice } from '../components/ExportDialog'
import ReclaimBand from '../components/ReclaimBand'
import LedgerToolbar from '../components/LedgerToolbar'
import ResultsList from '../components/ResultsList'
import type { BreakdownControls } from '../hooks/useDriveScan'
import type { ScannedFolder } from '../hooks/useScanner'
import { formatCount } from '../lib/format'
import { changesSince, scanSpan } from '../lib/history'
import { DEFAULT_VIEW, applyView, compareFor, SORT_LABELS, type LedgerView } from '../lib/ledger-view'
import { buildReport, reportFileName } from '../lib/report'
import { summarize } from '../lib/summary'
import { flattenLedger } from '../lib/tree'

interface Props {
  items: ScannedFolder[]
  selectedPath: string | null
  onSelect: (path: string) => void
  onClear: () => void
  onGoPick: () => void
  onRetryAi: (path: string) => void
  onOpenSettings: () => void
  breakdown: BreakdownControls
  onRescan: (path: string) => void
  /** The search, filter and sort. Kept by the app so they survive switching screens. */
  view: LedgerView
  onViewChange: (view: LedgerView) => void
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
  onRescan,
  view,
  onViewChange,
  note
}: Props): React.JSX.Element {
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [savedReport, setSavedReport] = useState<string | null>(null)

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

  // With nothing selected, show the biggest folder.
  const biggest = items.reduce((a, b) => (b.metadata.sizeBytes > a.metadata.sizeBytes ? b : a))
  const selected = items.find((i) => i.metadata.path === selectedPath) ?? biggest

  const result = applyView(items, view)

  const runExport = async (choice: ExportChoice): Promise<void> => {
    // "Shown" is exactly what the ledger lists now; "all" ignores the search and filter but keeps the sort.
    const rows = choice.scope === 'shown' ? result.rows : flattenLedger(items, compareFor(view.sort))
    setExporting(true)
    setExportError(null)
    try {
      const r = await window.dirvo.saveReport({
        content: buildReport(choice.format, rows),
        format: choice.format,
        suggestedName: reportFileName(choice.format),
        redactUser: choice.redactUser
      })
      if (r.status === 'saved') {
        setExportOpen(false)
        setSavedReport(r.path)
        setTimeout(() => setSavedReport((cur) => (cur === r.path ? null : cur)), 10000)
      } else if (r.status === 'error') {
        setExportError(r.message)
      }
      // 'cancelled': the Windows dialog was closed, so keep this one open in case they want to change something.
    } catch {
      setExportError('Could not save the report.')
    } finally {
      setExporting(false)
    }
  }
  const maxBytes = Math.max(1, ...items.map((i) => i.metadata.sizeBytes))

  return (
    <div className="flex h-full min-h-0 flex-col">
      {items.length > 1 && <ReclaimBand summary={summarize(items)} note={note} change={changesSince(items)} span={scanSpan(items)} />}

      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-14 shrink-0 items-center justify-between pl-4 pr-3">
            <h1 className="text-sm font-medium">
              Folders{' '}
              <span className="font-mono tabular-nums text-ink-3">
                {result.filtering ? `${formatCount(result.matched)} of ${formatCount(result.total)}` : formatCount(result.total)}
              </span>
            </h1>
            <div className="flex items-center">
              <Button
                variant="ghost"
                onClick={() => {
                  setExportError(null)
                  setExportOpen(true)
                }}
                className="h-8 text-xs"
              >
                <Download size={14} strokeWidth={1.5} aria-hidden />
                Export
              </Button>
              <Button variant="ghost" onClick={onClear} className="h-8 text-xs">
                Clear list
              </Button>
            </div>
          </div>
          {savedReport && (
            <div className="mx-4 mb-3 flex items-center justify-between gap-3 rounded-lg bg-ok-bg px-3 py-2 text-xs text-ok-ink" role="status">
              <span className="min-w-0 truncate">Report saved: {savedReport.split('\\').pop()}</span>
              <button
                type="button"
                onClick={() => void window.dirvo.openInExplorer(savedReport)}
                className="shrink-0 rounded-md px-2 py-1 font-medium underline-offset-2 hover:underline"
              >
                Show in folder
              </button>
            </div>
          )}
          {items.length >= 3 && <LedgerToolbar view={view} onChange={onViewChange} counts={result.counts} />}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {result.rows.length === 0 ? (
              <div className="flex flex-col items-start gap-3 px-4 py-8">
                <p className="text-sm font-medium">No folders match</p>
                <p className="text-sm text-ink-2">Try a different search, or show all rulings.</p>
                <Button onClick={() => onViewChange({ ...DEFAULT_VIEW, sort: view.sort })}>Clear search and filter</Button>
              </div>
            ) : (
              <ResultsList
                rows={result.rows}
                maxBytes={maxBytes}
                selectedPath={selected.metadata.path}
                onSelect={onSelect}
                label={`Scanned folders, ${SORT_LABELS[view.sort].toLowerCase()}`}
              />
            )}
          </div>
        </section>

        <aside className="w-96 shrink-0 overflow-y-auto border-l border-line bg-surface p-6">
          <DetailCard
            key={selected.metadata.path}
            item={selected}
            onRetryAi={() => onRetryAi(selected.metadata.path)}
            onOpenSettings={onOpenSettings}
            breakdown={breakdown}
            onRescan={() => onRescan(selected.metadata.path)}
          />
        </aside>
      </div>
      {exportOpen && (
        <ExportDialog
          totalCount={items.length}
          shownCount={result.filtering ? result.matched : null}
          busy={exporting}
          error={exportError}
          onCancel={() => setExportOpen(false)}
          onExport={(c) => void runExport(c)}
        />
      )}
    </div>
  )
}
