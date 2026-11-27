import { useCallback, useEffect, useRef, useState } from 'react'
import { FolderSearch, HardDrive, Rows3, Settings2, type LucideIcon } from 'lucide-react'
import type { DriveScanItem, DriveScanOutcome, SavedScans } from '@shared/types'
import type { FileActions } from './components/DetailCard'
import Kbd from './components/Kbd'
import Logo from './components/Logo'
import ShortcutsDialog from './components/ShortcutsDialog'
import Toast from './components/Toast'
import { useDriveScan, type BreakdownControls, type ScanKind } from './hooks/useDriveScan'
import { BATCH_CONCURRENCY, MAX_BATCH, countUnknown, pickUnknown, runBatch, type BatchControls, type BatchProgress, type BatchSummary, type ExplainOutcome } from './lib/batch'
import { recordScan, type History } from './lib/history'
import { DEFAULT_VIEW, applyView, type LedgerView } from './lib/ledger-view'
import { keyToAction, movedIndex, type ShortcutAction } from './lib/shortcuts'
import { normPath } from './lib/tree'
import { useScanner, type ScannedFolder } from './hooks/useScanner'
import PickFolder from './screens/PickFolder'
import Results from './screens/Results'
import ScanDrive from './screens/ScanDrive'
import Settings from './screens/Settings'

type Screen = 'pick' | 'drive' | 'results' | 'settings'

const NAV: Array<{ id: Screen; label: string; Icon: LucideIcon }> = [
  { id: 'pick', label: 'Folder or file', Icon: FolderSearch },
  { id: 'drive', label: 'Scan a drive', Icon: HardDrive },
  { id: 'results', label: 'Results', Icon: Rows3 },
  { id: 'settings', label: 'Settings', Icon: Settings2 }
]

export default function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('pick')
  const [items, setItems] = useState<ScannedFolder[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [view, setView] = useState<LedgerView>(DEFAULT_VIEW)
  const [exportOpen, setExportOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const searchRef = useRef<HTMLInputElement>(null)
  const itemsRef = useRef<ScannedFolder[]>([])
  itemsRef.current = items
  // Latest known size of every scanned folder. Kept outside the results so it survives "Clear list".
  const historyRef = useRef<History>({})
  // Saving waits until the saved results have been loaded, so an empty list never overwrites them.
  const [hydrated, setHydrated] = useState(false)
  const hydratedRef = useRef(false)
  const latestSave = useRef<SavedScans>({ items: [], history: {} })
  const [lastDrive, setLastDrive] = useState<{ drive: string; outcome: DriveScanOutcome; listed: number } | null>(null)

  /**
   * Adds a result, or refreshes the earlier result for the same folder. A refreshed result keeps
   * what the user already learned about it (an AI explanation, and having looked inside).
   */
  const upsert = useCallback((scanned: ScannedFolder) => {
    // Compare with the last time this folder was scanned (outside the state update, which must stay pure).
    const rec = recordScan(historyRef.current, scanned.metadata.path, scanned.metadata.sizeBytes, scanned.scannedAt)
    historyRef.current = rec.history
    const item: ScannedFolder = { ...scanned, ...(rec.previous ? { previous: rec.previous } : {}) }
    setItems((prev) => {
      const old = prev.find((i) => i.metadata.path === item.metadata.path)
      const merged: ScannedFolder = old
        ? {
            ...item,
            explanation: item.explanation ?? old.explanation,
            aiStatus: item.explanation ? 'none' : old.aiStatus,
            aiError: item.explanation ? undefined : old.aiError,
            lookedInside: old.lookedInside
          }
        : item
      return [...prev.filter((i) => i.metadata.path !== item.metadata.path), merged]
    })
  }, [])

  const patch = useCallback((path: string, change: Partial<ScannedFolder>) => {
    setItems((prev) => prev.map((i) => (i.metadata.path === path ? { ...i, ...change } : i)))
  }, [])

  /** Asks the AI about a folder Dirvo does not know. Only called when the offline lookup found nothing. */
  const runAi = useCallback(
    async (path: string, knownMetadata?: ScannedFolder['metadata']): Promise<ExplainOutcome> => {
      const metadata = knownMetadata ?? itemsRef.current.find((i) => i.metadata.path === path)?.metadata
      if (!metadata) return 'error'
      patch(path, { aiStatus: 'loading', aiError: undefined })
      try {
        const r = await window.dirvo.aiExplain(metadata)
        if (r.status === 'ok') {
          patch(path, { explanation: r.explanation, aiStatus: 'none' })
          return 'ok'
        }
        if (r.status === 'no-key') {
          patch(path, { aiStatus: 'no-key' })
          return 'no-key'
        }
        patch(path, { aiStatus: 'error', aiError: r.message })
        return 'error'
      } catch {
        patch(path, { aiStatus: 'error', aiError: 'Something went wrong while asking the AI.' })
        return 'error'
      }
    },
    [patch]
  )

  const onDone = useCallback(
    (item: ScannedFolder) => {
      upsert(item)
      setSelectedPath(item.metadata.path)
      setScreen('results')
      if (!item.explanation) void runAi(item.metadata.path, item.metadata)
    },
    [runAi, upsert]
  )

  const scanner = useScanner(onDone)

  // Drive scans list results as they arrive. Unknown folders are NOT sent to the AI automatically
  // (there can be hundreds); each has an "Explain with AI" button instead.
  const driveScanner = useDriveScan({
    onItem: useCallback(
      (item: DriveScanItem) => {
        upsert({ ...item, aiStatus: 'none', scannedAt: new Date().toISOString() })
      },
      [upsert]
    ),
    onFinished: useCallback(
      (outcome: DriveScanOutcome, target: string, kind: ScanKind, listed: number) => {
        if (kind === 'breakdown') {
          // Stay where we are: the folders just appeared under their parent in the ledger.
          if (outcome.status === 'done') {
            patch(target, { lookedInside: { listed, hiddenSmall: outcome.hiddenSmall, skipped: outcome.skipped } })
          }
          return
        }
        setLastDrive({ drive: target, outcome, listed })
        if (outcome.status === 'done' && listed > 0) {
          setSelectedPath(null)
          setScreen('results')
        }
      },
      [patch]
    )
  })
  const driveBusy = driveScanner.state.status === 'scanning'
  const folderBusy = scanner.state.status === 'scanning'

  const startDriveScan = (drive: string): void => {
    setLastDrive(null)
    void driveScanner.start(drive)
  }

  const scanState = driveScanner.state
  const breakdown: BreakdownControls = {
    runningPath: scanState.status === 'scanning' && scanState.kind === 'breakdown' ? scanState.target : null,
    listed: scanState.status === 'scanning' ? scanState.listed : 0,
    foldersScanned: scanState.status === 'scanning' ? (scanState.progress?.foldersScanned ?? 0) : 0,
    busy: driveBusy || folderBusy,
    start: (path, size) => void driveScanner.startBreakdown(path, size),
    cancel: driveScanner.cancel,
    rescan:
      scanner.state.status === 'scanning'
        ? {
            path: scanner.state.path,
            filesScanned: scanner.state.progress?.filesScanned ?? 0,
            bytesScanned: scanner.state.progress?.bytesScanned ?? 0
          }
        : null,
    cancelRescan: scanner.cancel
  }

  // After the provider or a key changes, retry folders that were waiting or failed.
  const onAiChanged = useCallback(() => {
    for (const i of itemsRef.current) {
      if (i.aiStatus === 'no-key' || i.aiStatus === 'error') void runAi(i.metadata.path)
    }
  }, [runAi])

  // Load the results saved last time. Offline rulings come back recomputed from the current database.
  useEffect(() => {
    let cancelled = false
    window.dirvo
      .loadScans()
      .then((saved) => {
        if (cancelled) return
        historyRef.current = { ...saved.history, ...historyRef.current }
        // Anything scanned while loading wins over what was saved.
        setItems((prev) => [...saved.items.filter((s) => !prev.some((p) => p.metadata.path === s.metadata.path)), ...prev])
      })
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) return
        hydratedRef.current = true
        setHydrated(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Save a moment after the results stop changing, and once more when the window closes.
  useEffect(() => {
    if (!hydrated) return
    latestSave.current = { items, history: historyRef.current }
    const t = setTimeout(() => void window.dirvo.saveScans(latestSave.current).catch(() => undefined), 1500)
    return () => clearTimeout(t)
  }, [items, hydrated])
  useEffect(() => {
    const flush = (): void => {
      if (hydratedRef.current) void window.dirvo.saveScans(latestSave.current).catch(() => undefined)
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [])

  const forgetScans = useCallback(() => {
    historyRef.current = {}
    setItems([])
    setSelectedPath(null)
    setView(DEFAULT_VIEW)
    void window.dirvo.forgetScans()
  }, [])

  // ---- Keyboard shortcuts. The listener is attached once and always calls the latest handler.
  const flash = (message: string): void => {
    setToast(message)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }

  /** A rescan of one file is instant (one lookup), so it needs no progress. A folder is scanned in full. */
  const rescanItem = (item: ScannedFolder): void => {
    const path = item.metadata.path
    if (item.metadata.kind !== 'file') {
      void scanner.start(path)
      return
    }
    window.dirvo
      .inspectFile(path)
      .then((r) => {
        if (r.status === 'done') upsert({ metadata: r.result, explanation: r.explanation, aiStatus: 'none', scannedAt: new Date().toISOString() })
        else flash(r.status === 'error' ? r.message : 'That is a folder now')
      })
      .catch(() => flash('Could not look at that file'))
  }

  const fileActions: FileActions = {
    explain: (path) => {
      if (folderBusy || driveBusy) flash('Another scan is running')
      else void scanner.explainFile(path)
    },
    isListed: (path) => items.some((i) => normPath(i.metadata.path) === normPath(path)),
    select: (path) => setSelectedPath(items.find((i) => normPath(i.metadata.path) === normPath(path))?.metadata.path ?? null)
  }

  const runShortcut = (action: ShortcutAction): void => {
    switch (action.type) {
      case 'screen':
        setScreen(action.screen)
        return
      case 'help':
        setHelpOpen(true)
        return
      case 'search':
        setScreen('results')
        // The box is only on screen with three or more results, and may need a moment to appear.
        setTimeout(() => {
          if (searchRef.current) searchRef.current.focus()
          else flash('Search appears once there are three or more results')
        }, 0)
        return
      case 'export':
        if (items.length === 0) flash('Nothing to export yet')
        else {
          setScreen('results')
          setExportOpen(true)
        }
        return
      case 'move': {
        const rows = applyView(items, view).rows
        if (rows.length === 0) return
        const current = rows.findIndex((r) => r.item.metadata.path === selectedPath)
        const next = rows[movedIndex(current, rows.length, action.to)]
        if (next) setSelectedPath(next.item.metadata.path)
        return
      }
      case 'row': {
        if (items.length === 0) return
        const item = items.find((i) => i.metadata.path === selectedPath) ?? items.reduce((a, b) => (b.metadata.sizeBytes > a.metadata.sizeBytes ? b : a))
        const m = item.metadata
        if (action.do === 'open') {
          void window.dirvo.openInExplorer(m.path)
          flash('Opened in Explorer')
        } else if (action.do === 'copy') {
          void window.dirvo.copyPath(m.path).then(() => flash('Path copied'))
        } else if (action.do === 'rescan') {
          if (breakdown.busy) flash('Another scan is running')
          else rescanItem(item)
        } else if (action.do === 'lookInside') {
          if (m.kind === 'file') flash('A file has nothing inside it')
          else if (m.dirCount === 0) flash('There are no folders inside this one')
          else if (item.lookedInside) flash('Already looked inside this folder')
          else if (breakdown.busy) flash('Another scan is running')
          else breakdown.start(m.path, m.sizeBytes)
        } else if (action.do === 'explainAi') {
          if (item.explanation) flash('Dirvo already knows this one')
          else if (item.aiStatus !== 'loading') void runAi(m.path)
        }
        return
      }
    }
  }
  const runShortcutRef = useRef(runShortcut)
  runShortcutRef.current = runShortcut
  const keyState = useRef({ screen, modalOpen: false })
  keyState.current = { screen, modalOpen: exportOpen || helpOpen }

  useEffect(() => {
    const onKey = (ev: KeyboardEvent): void => {
      const el = ev.target as HTMLElement | null
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
      const action = keyToAction(ev, { typing, ...keyState.current })
      if (!action) return
      ev.preventDefault()
      runShortcutRef.current(action)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---- Explain unknown folders: a capped, confirmed, cancellable run through the same path as one folder.
  const [batchRunning, setBatchRunning] = useState<BatchProgress | null>(null)
  const [batchResult, setBatchResult] = useState<BatchSummary | null>(null)
  const batchCancelled = useRef(false)
  const batchActive = useRef(false)

  const startBatch = useCallback(async () => {
    if (batchActive.current) return
    const paths = pickUnknown(itemsRef.current)
    if (paths.length === 0) return
    batchActive.current = true
    batchCancelled.current = false
    setBatchResult(null)
    try {
      const summary = await runBatch(paths, (p) => runAi(p), {
        concurrency: BATCH_CONCURRENCY,
        isCancelled: () => batchCancelled.current,
        onProgress: setBatchRunning
      })
      setBatchResult(summary)
    } finally {
      batchActive.current = false
      setBatchRunning(null)
    }
  }, [runAi])

  const batch: BatchControls = {
    unknownCount: countUnknown(items),
    cap: MAX_BATCH,
    running: batchRunning,
    result: batchResult,
    start: () => void startBatch(),
    cancel: () => {
      batchCancelled.current = true
    },
    dismissResult: () => setBatchResult(null)
  }

  const unknownWaiting = items.filter((i) => i.aiStatus === 'no-key').length

  return (
    <div className="flex h-screen">
      <nav className="flex w-56 shrink-0 flex-col gap-0.5 border-r border-line bg-surface p-4" aria-label="Main">
        <div className="px-3 pb-6 pt-1">
          {/* The wordmark is set in mono, like the paths and sizes the app is about. */}
          <p className="flex items-center gap-3 font-mono text-lg font-medium">
            <Logo size={24} className="text-ink" />
            Dirvo
          </p>
          <p className="mt-1 text-balance text-xs text-ink-3">Mystery folders and files, explained</p>
        </div>
        {NAV.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setScreen(id)}
            aria-current={screen === id ? 'page' : undefined}
            className={`flex h-9 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition-colors duration-150 ease-out-soft ${
              screen === id ? 'bg-raised text-ink' : 'text-ink-2 hover:bg-raised hover:text-ink'
            }`}
          >
            <Icon size={16} strokeWidth={1.5} className="shrink-0 text-ink-3" aria-hidden />
            <span className="flex-1">{label}</span>
            {id === 'results' && items.length > 0 && (
              <span className="font-mono text-xs tabular-nums text-ink-3">{items.length}</span>
            )}
            {id === 'drive' && driveBusy && <span className="h-2 w-2 animate-pulse rounded-full bg-ink" title="Scanning a drive" />}
            {id === 'settings' && unknownWaiting > 0 && (
              <span className="h-2 w-2 rounded-full bg-warn-dot" title="An API key is needed to explain unknown folders" />
            )}
          </button>
        ))}
        <div className="mt-auto flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="flex h-8 items-center justify-between rounded-lg px-3 text-xs text-ink-3 transition-colors duration-150 ease-out-soft hover:bg-raised hover:text-ink"
          >
            Keyboard shortcuts
            <Kbd>?</Kbd>
          </button>
          <p className="px-3 text-xs text-ink-3">Dirvo only advises and never deletes</p>
        </div>
      </nav>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {screen === 'pick' && (
          <PickFolder
            scanner={scanner.state}
            blocked={driveBusy}
            onScan={(p) => void scanner.start(p)}
            onFile={(p) => void scanner.explainFile(p)}
            onExplainPath={(p) => void scanner.explainPath(p)}
            onCancel={scanner.cancel}
            onDismissError={scanner.clearError}
          />
        )}
        {screen === 'drive' && (
          <ScanDrive
            scanner={driveScanner.state}
            last={lastDrive}
            folderScanBusy={folderBusy}
            onScan={startDriveScan}
            onCancel={driveScanner.cancel}
            onDismissError={driveScanner.clearError}
            onViewResults={() => setScreen('results')}
          />
        )}
        {screen === 'results' && (
          <Results
            items={items}
            selectedPath={selectedPath}
            onSelect={setSelectedPath}
            onClear={() => {
              setItems([])
              setSelectedPath(null)
            }}
            onGoPick={() => setScreen('pick')}
            onRetryAi={(p) => void runAi(p)}
            onOpenSettings={() => setScreen('settings')}
            breakdown={breakdown}
            onRescan={(p) => {
              const found = items.find((i) => i.metadata.path === p)
              if (found) rescanItem(found)
            }}
            files={fileActions}
            batch={batch}
            exportOpen={exportOpen}
            onExportOpenChange={setExportOpen}
            searchRef={searchRef}
            view={view}
            onViewChange={setView}
            note={
              lastDrive?.outcome.status === 'done'
                ? `Drive ${lastDrive.drive} · folders and files of ${Math.round(lastDrive.outcome.minBytes / 1048576)} MB or more`
                : null
            }
          />
        )}
        {screen === 'settings' && <Settings onAiChanged={onAiChanged} savedCount={items.length} onForgetScans={forgetScans} />}
      </main>

      {helpOpen && <ShortcutsDialog onClose={() => setHelpOpen(false)} />}
      <Toast message={toast} />
    </div>
  )
}
