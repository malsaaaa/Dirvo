import { useCallback, useState } from 'react'
import { useScanner, type ScannedFolder } from './hooks/useScanner'
import PickFolder from './screens/PickFolder'
import Results from './screens/Results'
import ScanDrive from './screens/ScanDrive'

type Screen = 'pick' | 'drive' | 'results'

const NAV: Array<{ id: Screen; label: string }> = [
  { id: 'pick', label: 'Explain a folder' },
  { id: 'drive', label: 'Scan a drive' },
  { id: 'results', label: 'Results' }
]

export default function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('pick')
  const [items, setItems] = useState<ScannedFolder[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  const onDone = useCallback((item: ScannedFolder) => {
    // Scanning the same folder again replaces the old result.
    setItems((prev) => [...prev.filter((i) => i.metadata.path !== item.metadata.path), item])
    setSelectedPath(item.metadata.path)
    setScreen('results')
  }, [])

  const scanner = useScanner(onDone)

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
          />
        )}
      </main>
    </div>
  )
}
