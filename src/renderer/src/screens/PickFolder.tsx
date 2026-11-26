import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import Button, { INPUT_CLASS } from '../components/Button'
import ScanStatus from '../components/ScanStatus'
import type { ScannerState } from '../hooks/useScanner'
import { VERDICT_STYLE } from '../lib/verdict'

interface Props {
  scanner: ScannerState
  /** A drive scan is running, so folder scans wait. */
  blocked: boolean
  onScan: (path: string) => void
  onCancel: () => void
  onDismissError: () => void
}

const RULINGS = ['SAFE', 'REBUILDS_AUTOMATICALLY', 'CAUTION', 'DONT_TOUCH'] as const

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
    <div className="flex max-w-2xl flex-col gap-8 p-8">
      <header>
        <h1 className="text-3xl font-medium">Explain a folder</h1>
        <p className="mt-2 text-ink-2">
          Point Dirvo at a folder you don&apos;t recognise. It reads only names, sizes and dates, never what is inside
          your files, and gives a ruling: what it is, who made it, and whether you can delete it.
        </p>
      </header>

      <form
        className="flex flex-col gap-2"
        onSubmit={(ev) => {
          ev.preventDefault()
          if (typedOk && !busy) onScan(typed.trim())
        }}
      >
        <label htmlFor="folder-path" className="text-sm font-medium text-ink-2">
          Folder path
        </label>
        <div className="flex gap-2">
          <input
            id="folder-path"
            value={typed}
            onChange={(ev) => setTyped(ev.target.value)}
            placeholder="C:\Users\you\AppData\Local\Something"
            spellCheck={false}
            autoComplete="off"
            className={`${INPUT_CLASS} h-11 font-mono`}
          />
          <Button type="button" className="h-11" onClick={() => void browse()} disabled={busy}>
            <FolderOpen size={16} strokeWidth={1.5} aria-hidden />
            Browse
          </Button>
          <Button type="submit" variant="primary" className="h-11" disabled={!typedOk || busy}>
            Explain
          </Button>
        </div>
      </form>

      {blocked && <p className="text-sm text-ink-2">A drive scan is running. Folder scans are available when it finishes.</p>}

      <ScanStatus state={scanner} onCancel={onCancel} onDismissError={onDismissError} />

      <section aria-labelledby="rulings">
        <h2 id="rulings" className="text-sm font-medium text-ink-2">
          The four rulings
        </h2>
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {RULINGS.map((r) => (
            <li key={r} className="grid grid-cols-[168px_minmax(0,1fr)] items-center gap-4 py-3">
              <span className={`inline-flex items-center gap-2 text-sm font-medium ${VERDICT_STYLE[r].text}`}>
                <span className={`h-2 w-2 rounded-full ${VERDICT_STYLE[r].dot}`} />
                {VERDICT_STYLE[r].label}
              </span>
              <span className="text-sm text-ink-2">{VERDICT_STYLE[r].meaning}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
