import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import Button, { INPUT_CLASS } from '../components/Button'
import ScanStatus from '../components/ScanStatus'
import type { ScannerState } from '../hooks/useScanner'

interface Props {
  scanner: ScannerState
  /** A drive scan is running, so folder scans wait. */
  blocked: boolean
  onScan: (path: string) => void
  onCancel: () => void
  onDismissError: () => void
}

export default function PickFolder({ scanner, blocked, onScan, onCancel, onDismissError }: Props): React.JSX.Element {
  const [typed, setTyped] = useState('')
  const busy = scanner.status === 'scanning' || blocked
  // Accept C:\ style paths only; the main process validates again.
  const typedOk = /^[a-zA-Z]:[\\/]/.test(typed.trim())

  const browse = async (): Promise<void> => {
    const picked = await window.dirvo.pickFolder()
    if (picked) onScan(picked)
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-3xl font-medium">Explain a folder</h1>
        <p className="mt-2 text-zinc-600">
          Pick a mystery folder. Dirvo looks only at names, sizes and dates, never at what is inside your files, and
          tells you what it is and whether it is safe to delete.
        </p>
      </header>

      <button
        type="button"
        onClick={() => void browse()}
        disabled={busy}
        className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-zinc-900 transition-colors duration-150 ease-out-soft hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <FolderOpen size={24} strokeWidth={1.5} className="text-zinc-500" aria-hidden />
        <span className="text-base font-medium">Choose a folder…</span>
        <span className="text-xs text-zinc-500">Opens the Windows folder picker</span>
      </button>

      <form
        className="flex gap-2"
        onSubmit={(ev) => {
          ev.preventDefault()
          if (typedOk && !busy) onScan(typed.trim())
        }}
      >
        <input
          value={typed}
          onChange={(ev) => setTyped(ev.target.value)}
          placeholder="…or paste a path, e.g. C:\Users\you\AppData\Local\Temp"
          aria-label="Folder path"
          spellCheck={false}
          className={`${INPUT_CLASS} font-mono`}
        />
        <Button type="submit" variant="primary" disabled={!typedOk || busy}>
          Explain
        </Button>
      </form>

      {blocked && <p className="text-sm text-zinc-600">A drive scan is running. Folder scans are available when it finishes.</p>}

      <ScanStatus state={scanner} onCancel={onCancel} onDismissError={onDismissError} />
    </div>
  )
}
