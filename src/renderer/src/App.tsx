import { useCallback, useRef, useState } from 'react'
import { FolderSearch, HardDrive, Rows3, Settings2, type LucideIcon } from 'lucide-react'
import type { DriveScanItem, DriveScanOutcome } from '@shared/types'
import Logo from './components/Logo'
import { useDriveScan, type BreakdownControls, type ScanKind } from './hooks/useDriveScan'
import { useScanner, type ScannedFolder } from './hooks/useScanner'
import PickFolder from './screens/PickFolder'
import Results from './screens/Results'
import ScanDrive from './screens/ScanDrive'
import Settings from './screens/Settings'

type Screen = 'pick' | 'drive' | 'results' | 'settings'

const NAV: Array<{ id: Screen; label: string; Icon: LucideIcon }> = [
  { id: 'pick', label: 'Explain a folder', Icon: FolderSearch },
  { id: 'drive', label: 'Scan a drive', Icon: HardDrive },
  { id: 'results', label: 'Results', Icon: Rows3 },
  { id: 'settings', label: 'Settings', Icon: Settings2 }
]

export default function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('pick')
  const [items, setItems] = useState<ScannedFolder[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const itemsRef = useRef<ScannedFolder[]>([])
  itemsRef.current = items
  const [lastDrive, setLastDrive] = useState<{ drive: string; outcome: DriveScanOutcome; listed: number } | null>(null)

  /**
   * Adds a result, or refreshes the earlier result for the same folder. A refreshed result keeps
   * what the user already learned about it (an AI explanation, and having looked inside).
   */
  const upsert = useCallback((item: ScannedFolder) => {
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
    async (path: string, knownMetadata?: ScannedFolder['metadata']) => {
      const metadata = knownMetadata ?? itemsRef.current.find((i) => i.metadata.path === path)?.metadata
      if (!metadata) return
      patch(path, { aiStatus: 'loading', aiError: undefined })
      try {
        const r = await window.dirvo.aiExplain(metadata)
        if (r.status === 'ok') patch(path, { explanation: r.explanation, aiStatus: 'none' })
        else if (r.status === 'no-key') patch(path, { aiStatus: 'no-key' })
        else patch(path, { aiStatus: 'error', aiError: r.message })
      } catch {
        patch(path, { aiStatus: 'error', aiError: 'Something went wrong while asking the AI.' })
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
        upsert({ ...item, aiStatus: 'none' })
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
    cancel: driveScanner.cancel
  }

  // After the provider or a key changes, retry folders that were waiting or failed.
  const onAiChanged = useCallback(() => {
    for (const i of itemsRef.current) {
      if (i.aiStatus === 'no-key' || i.aiStatus === 'error') void runAi(i.metadata.path)
    }
  }, [runAi])

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
          <p className="mt-1 text-xs text-ink-3">Mystery folders, explained</p>
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
        <p className="mt-auto px-3 text-xs text-ink-3">Dirvo only advises and never deletes</p>
      </nav>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {screen === 'pick' && (
          <PickFolder
            scanner={scanner.state}
            blocked={driveBusy}
            onScan={(p) => void scanner.start(p)}
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
            note={
              lastDrive?.outcome.status === 'done'
                ? `Drive ${lastDrive.drive} · folders of ${Math.round(lastDrive.outcome.minBytes / 1048576)} MB or more`
                : null
            }
          />
        )}
        {screen === 'settings' && <Settings onAiChanged={onAiChanged} />}
      </main>
    </div>
  )
}
