import { useCallback, useEffect, useRef, useState } from 'react'
import type { DriveScanItem, DriveScanOutcome, DriveScanProgress } from '@shared/types'

export type DriveScanState =
  | { status: 'idle' }
  | { status: 'scanning'; drive: string; progress: DriveScanProgress | null; listed: number }
  | { status: 'error'; message: string }

interface Callbacks {
  /** A folder finished scanning and is big enough to list. */
  onItem: (item: DriveScanItem) => void
  onFinished: (outcome: DriveScanOutcome, drive: string) => void
}

/** Runs one drive scan at a time. Results stream in through onItem while it runs. */
export function useDriveScan(callbacks: Callbacks): {
  state: DriveScanState
  start: (drive: string) => Promise<void>
  cancel: () => void
  clearError: () => void
} {
  const [state, setState] = useState<DriveScanState>({ status: 'idle' })
  const scanId = useRef<string | null>(null)
  const cb = useRef(callbacks)
  cb.current = callbacks

  useEffect(
    () =>
      window.dirvo.onDriveEvent((event) => {
        if (event.scanId !== scanId.current) return
        if (event.type === 'item') {
          cb.current.onItem(event.item)
          setState((s) => (s.status === 'scanning' ? { ...s, listed: s.listed + 1 } : s))
        } else {
          setState((s) => (s.status === 'scanning' ? { ...s, progress: event.progress } : s))
        }
      }),
    []
  )

  const start = useCallback(async (drive: string) => {
    if (scanId.current) return
    const id = crypto.randomUUID()
    scanId.current = id
    setState({ status: 'scanning', drive, progress: null, listed: 0 })
    try {
      const outcome = await window.dirvo.scanDrive(id, drive)
      if (outcome.status === 'error') setState({ status: 'error', message: outcome.message })
      else setState({ status: 'idle' })
      cb.current.onFinished(outcome, drive)
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Something went wrong' })
    } finally {
      scanId.current = null
    }
  }, [])

  const cancel = useCallback(() => {
    if (scanId.current) void window.dirvo.cancelScan(scanId.current)
  }, [])

  const clearError = useCallback(() => setState({ status: 'idle' }), [])

  return { state, start, cancel, clearError }
}
