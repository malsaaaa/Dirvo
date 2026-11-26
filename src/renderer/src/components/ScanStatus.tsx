import type { ScannerState } from '../hooks/useScanner'
import { formatBytes, formatCount, shortenPath } from '../lib/format'

interface Props {
  state: ScannerState
  onCancel: () => void
  onDismissError: () => void
}

/** Shows scan progress (with Cancel) or the last error. Renders nothing when idle. */
export default function ScanStatus({ state, onCancel, onDismissError }: Props): React.JSX.Element | null {
  if (state.status === 'idle') return null

  if (state.status === 'error') {
    return (
      <div role="alert" className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <div>
          <p className="font-medium">Could not scan that folder</p>
          <p className="mt-0.5 text-red-800">{state.message}</p>
        </div>
        <button onClick={onDismissError} className="shrink-0 rounded-md px-2 py-1 text-red-800 hover:bg-red-100">
          Dismiss
        </button>
      </div>
    )
  }

  const p = state.progress
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">Scanning {shortenPath(state.path, 70)}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {p ? `${formatCount(p.filesScanned)} files · ${formatBytes(p.bytesScanned)} so far` : 'Starting…'}
          </p>
        </div>
        <button
          onClick={onCancel}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full w-1/3 animate-[slide_1.2s_ease-in-out_infinite] rounded-full bg-indigo-500" />
      </div>
      <p className="mt-2 truncate text-xs text-slate-400">{p ? shortenPath(p.currentPath, 90) : ''}</p>
    </div>
  )
}
