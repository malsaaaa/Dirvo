import { useCallback, useRef, useState } from 'react'
import { useScanner, type ScannedFolder } from './hooks/useScanner'
import PickFolder from './screens/PickFolder'
import Results from './screens/Results'
import ScanDrive from './screens/ScanDrive'
import Settings from './screens/Settings'

type Screen = 'pick' | 'drive' | 'results' | 'settings'

const NAV: Array<{ id: Screen; label: string }> = [
  { id: 'pick', label: 'Explain a folder' },
  { id: 'drive', label: 'Scan a drive' },
  { id: 'results', label: 'Results' },
  { id: 'settings', label: 'Settings' }
]

export default function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('pick')
  const [items, setItems] = useState<ScannedFolder[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const itemsRef = useRef<ScannedFolder[]>([])
  itemsRef.current = items

  const patch = useCallback((path: string, change: Partial<ScannedFolder>) => {
    setItems((prev) => prev.map((i) => (i.metadata.path === path ? { ...i, ...change } : i)))
  }, [])

  /** Asks the AI about a folder Dirvo does not know. Only called when the offline lookup found nothing. */
  const runAi = useCallback(
    async (path: string) => {
      const item = itemsRef.current.find((i) => i.metadata.path === path)
      if (!item) return
      patch(path, { aiStatus: 'loading', aiError: undefined })
      try {
        const r = await window.dirvo.aiExplain(item.metadata)
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
      // Scanning the same folder again replaces the old result.
      itemsRef.current = [...itemsRef.current.filter((i) => i.metadata.path !== item.metadata.path), item]
      setItems(itemsRef.current)
      setSelectedPath(item.metadata.path)
      setScreen('results')
      if (!item.explanation) void runAi(item.metadata.path)
    },
    [runAi]
  )

  const scanner = useScanner(onDone)

  // After a key is saved, explain any folders that were waiting for one.
  const onKeyChanged = useCallback(() => {
    for (const i of itemsRef.current) {
      if (i.aiStatus === 'no-key' || i.aiStatus === 'error') void runAi(i.metadata.path)
    }
  }, [runAi])

  const unknownWaiting = items.filter((i) => i.aiStatus === 'no-key').length

  return (
    <div className="flex h-screen">
      <nav className="flex w-52 shrink-0 flex-col gap-1 border-r border-slate-200 bg-white p-3" aria-label="Main">
        <div className="px-3 pb-4 pt-2">
          <p className="text-lg font-semibold tracking-tight">Dirvo</p>
          <p className="text-xs text-slate-500">Mystery folders, explained</p>
        </div>
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => setScreen(n.id)}
            aria-current={screen === n.id ? 'page' : undefined}
            className={`flex items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium ${
              screen === n.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            {n.label}
            {n.id === 'results' && items.length > 0 && (
              <span className="rounded-full bg-slate-200 px-1.5 text-xs text-slate-700">{items.length}</span>
            )}
            {n.id === 'settings' && unknownWaiting > 0 && (
              <span className="h-2 w-2 rounded-full bg-amber-500" title="An API key is needed to explain unknown folders" />
            )}
          </button>
        ))}
        <p className="mt-auto px-3 py-2 text-xs text-slate-400">Dirvo only advises. It never deletes.</p>
      </nav>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {screen === 'pick' && (
          <PickFolder
            scanner={scanner.state}
            onScan={(p) => void scanner.start(p)}
            onCancel={scanner.cancel}
            onDismissError={scanner.clearError}
          />
        )}
        {screen === 'drive' && <ScanDrive />}
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
          />
        )}
        {screen === 'settings' && <Settings onKeyChanged={onKeyChanged} />}
      </main>
    </div>
  )
}
