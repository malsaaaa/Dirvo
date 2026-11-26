import type { ScannerState } from '../hooks/useScanner'
import { formatBytes, formatCount, shortenPath } from '../lib/format'
import Button from './Button'

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
      <div role="alert" className="flex items-start justify-between gap-4 rounded-lg border border-bad-line bg-bad-bg p-5 text-sm text-bad-ink">
        <div>
          <p className="font-medium">Could not scan that folder</p>
          <p className="mt-1">{state.message}</p>
        </div>
        <Button variant="ghost" onClick={onDismissError}>
          Dismiss
        </Button>
      </div>
    )
  }

  const p = state.progress
  return (
    <div className="rounded-lg border border-line bg-surface p-5" aria-live="polite">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            Scanning <span className="font-mono">{shortenPath(state.path, 60)}</span>
          </p>
          <p className="mt-1 text-xs tabular-nums text-ink-3">
            {p ? `${formatCount(p.filesScanned)} files · ${formatBytes(p.bytesScanned)} so far` : 'Starting…'}
          </p>
        </div>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-track">
        <div className="h-full w-1/3 animate-[slide_1.2s_ease-in-out_infinite] rounded-full bg-ink" />
      </div>
      <p className="mt-3 truncate font-mono text-xs text-ink-3">{p ? shortenPath(p.currentPath, 90) : ''}</p>
    </div>
  )
}
