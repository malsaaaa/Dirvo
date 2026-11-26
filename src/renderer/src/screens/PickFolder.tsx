import { useState } from 'react'
import ScanStatus from '../components/ScanStatus'
import type { ScannerState } from '../hooks/useScanner'

interface Props {
  scanner: ScannerState
  onScan: (path: string) => void
  onCancel: () => void
  onDismissError: () => void
}

export default function PickFolder({ scanner, onScan, onCancel, onDismissError }: Props): React.JSX.Element {
  const [typed, setTyped] = useState('')
  const busy = scanner.status === 'scanning'
  // Accept C:\ style paths only; the main process validates again.
  const typedOk = /^[a-zA-Z]:[\\/]/.test(typed.trim())

  const browse = async (): Promise<void> => {
    const picked = await window.dirvo.pickFolder()
    if (picked) onScan(picked)
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Explain a folder</h1>
        <p className="mt-1 text-slate-600">
          Pick a mystery folder. Dirvo looks only at names, sizes and dates, never at what is inside your files, and
          tells you what it is and whether it is safe to delete.
        </p>
      </header>

      <button
        onClick={() => void browse()}
        disabled={busy}
        className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-6 py-10 text-slate-700 transition hover:border-indigo-400 hover:bg-indigo-50/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="text-3xl" aria-hidden>
          📁
        </span>
        <span className="text-base font-medium">Choose a folder…</span>
        <span className="text-xs text-slate-500">Opens the Windows folder picker</span>
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
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
        <button
          type="submit"
          disabled={!typedOk || busy}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Explain
        </button>
      </form>

      <ScanStatus state={scanner} onCancel={onCancel} onDismissError={onDismissError} />
    </div>
  )
}
