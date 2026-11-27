import { useState } from 'react'
import { File, FolderOpen } from 'lucide-react'
import Button, { INPUT_CLASS } from '../components/Button'
import ScanStatus from '../components/ScanStatus'
import type { ScannerState } from '../hooks/useScanner'
import { VERDICT_STYLE } from '../lib/verdict'

interface Props {
  scanner: ScannerState
  /** A drive scan or "look inside" is running, so folder scans wait. */
  blocked: boolean
  /** A folder was chosen: scan it. */
  onScan: (path: string) => void
  /** A file was chosen in the file picker. */
  onFile: (path: string) => void
  /** A path was typed: it may be a file or a folder. */
  onExplainPath: (path: string) => void
  onCancel: () => void
  onDismissError: () => void
}

const RULINGS = ['SAFE', 'REBUILDS_AUTOMATICALLY', 'CAUTION', 'DONT_TOUCH'] as const

export default function PickFolder({ scanner, blocked, onScan, onFile, onExplainPath, onCancel, onDismissError }: Props): React.JSX.Element {
  const [typed, setTyped] = useState('')
  const busy = scanner.status === 'scanning' || blocked
  // Accept C:\ style paths only; the main process validates again.
  const typedOk = /^[a-zA-Z]:[\\/]/.test(typed.trim())

  const browse = async (): Promise<void> => {
    const picked = await window.dirvo.pickFolder()
    if (picked) onScan(picked)
  }

  const browseFile = async (): Promise<void> => {
    const picked = await window.dirvo.pickFile()
    if (picked) onFile(picked)
  }

  return (
    <div className="flex max-w-2xl flex-col gap-8 p-8">
      <header>
        <h1 className="text-3xl font-medium">Explain a folder or file</h1>
        <p className="mt-2 text-ink-2">
          Point Dirvo at a folder or a file you don&apos;t recognise. It reads only names, sizes and dates, never what
          is inside your files, and gives a ruling: what it is, who made it, and whether you can delete it.
        </p>
      </header>

      <form
        className="flex flex-col gap-2"
        onSubmit={(ev) => {
          ev.preventDefault()
          if (typedOk && !busy) onExplainPath(typed.trim())
        }}
      >
        <label htmlFor="folder-path" className="text-sm font-medium text-ink-2">
          Folder or file path
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
            Browse folder
          </Button>
          <Button type="button" className="h-11" onClick={() => void browseFile()} disabled={busy}>
            <File size={16} strokeWidth={1.5} aria-hidden />
            Browse file
          </Button>
          <Button type="submit" variant="primary" className="h-11" disabled={!typedOk || busy}>
            Explain
          </Button>
        </div>
      </form>

      {blocked && <p className="text-sm text-ink-2">Another scan is running. Folders and files can be explained when it finishes.</p>}

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
