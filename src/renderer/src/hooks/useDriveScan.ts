import { useCallback, useEffect, useRef, useState } from 'react'
import type { DriveScanItem, DriveScanOutcome, DriveScanProgress } from '@shared/types'

/** 'drive': a whole drive. 'breakdown': "look inside" one folder. Both stream results the same way. */
export type ScanKind = 'drive' | 'breakdown'

export type DriveScanState =
  | { status: 'idle' }
  | { status: 'scanning'; kind: ScanKind; target: string; progress: DriveScanProgress | null; listed: number }
  | { status: 'error'; message: string }

interface Callbacks {
  /** A folder finished scanning and is big enough to list. */
  onItem: (item: DriveScanItem) => void
  /** `listed` is how many folders this run added to the results. */
  onFinished: (outcome: DriveScanOutcome, target: string, kind: ScanKind, listed: number) => void
}

/** What the results screen needs to offer "look inside". */
export interface BreakdownControls {
  /** The folder being looked inside right now, if any. */
  runningPath: string | null
  listed: number
  foldersScanned: number
  /** Another scan is running, so a new one cannot start. */
  busy: boolean
  start: (path: string, sizeBytes: number) => void
  cancel: () => void
}

/** Small folders are hidden: 1% of the folder's size, kept between 1 MB and 50 MB. */
export function breakdownThreshold(sizeBytes: number): number {
  const MB = 1024 * 1024
  return Math.min(50 * MB, Math.max(MB, Math.floor(sizeBytes / 100)))
}

/** Runs one drive scan or "look inside" at a time. Results stream in through onItem while it runs. */
export function useDriveScan(callbacks: Callbacks): {
  state: DriveScanState
  start: (drive: string) => Promise<void>
  startBreakdown: (path: string, sizeBytes: number) => Promise<void>
  cancel: () => void
  clearError: () => void
} {
  const [state, setState] = useState<DriveScanState>({ status: 'idle' })
  const scanId = useRef<string | null>(null)
  const listedRef = useRef(0)
  const cb = useRef(callbacks)
  cb.current = callbacks

  useEffect(
    () =>
      window.dirvo.onDriveEvent((event) => {
        if (event.scanId !== scanId.current) return
        if (event.type === 'item') {
          listedRef.current++
          cb.current.onItem(event.item)
          setState((s) => (s.status === 'scanning' ? { ...s, listed: s.listed + 1 } : s))
        } else {
          setState((s) => (s.status === 'scanning' ? { ...s, progress: event.progress } : s))
        }
      }),
    []
  )

  const run = useCallback(async (kind: ScanKind, target: string, run: (id: string) => Promise<DriveScanOutcome>) => {
    if (scanId.current) return
    const id = crypto.randomUUID()
    scanId.current = id
    listedRef.current = 0
    setState({ status: 'scanning', kind, target, progress: null, listed: 0 })
    try {
      const outcome = await run(id)
      if (outcome.status === 'error') setState({ status: 'error', message: outcome.message })
      else setState({ status: 'idle' })
      cb.current.onFinished(outcome, target, kind, listedRef.current)
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Something went wrong' })
    } finally {
      scanId.current = null
    }
  }, [])

  const start = useCallback((drive: string) => run('drive', drive, (id) => window.dirvo.scanDrive(id, drive)), [run])

  const startBreakdown = useCallback(
    (path: string, sizeBytes: number) =>
      run('breakdown', path, (id) => window.dirvo.breakdownFolder(id, path, breakdownThreshold(sizeBytes))),
    [run]
  )

  const cancel = useCallback(() => {
    if (scanId.current) void window.dirvo.cancelScan(scanId.current)
  }, [])

  const clearError = useCallback(() => setState({ status: 'idle' }), [])

  return { state, start, startBreakdown, cancel, clearError }
}
