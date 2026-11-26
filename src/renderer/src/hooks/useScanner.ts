import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScannedFolder, ScanProgress } from '@shared/types'

export type { AiStatus, ScannedFolder } from '@shared/types'

export type ScannerState =
  | { status: 'idle' }
  | { status: 'scanning'; path: string; progress: ScanProgress | null }
  | { status: 'error'; message: string }

/** Runs one folder scan at a time and reports the finished result to `onDone`. */
export function useScanner(onDone: (item: ScannedFolder) => void): {
  state: ScannerState
  start: (path: string) => Promise<void>
  cancel: () => void
  clearError: () => void
} {
  const [state, setState] = useState<ScannerState>({ status: 'idle' })
  const scanId = useRef<string | null>(null)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(
    () =>
      window.dirvo.onScanProgress((id, progress) => {
        if (id !== scanId.current) return
        setState((s) => (s.status === 'scanning' ? { ...s, progress } : s))
      }),
    []
  )

  const start = useCallback(async (path: string) => {
    if (scanId.current) return
    const id = crypto.randomUUID()
    scanId.current = id
    setState({ status: 'scanning', path, progress: null })
    try {
      const outcome = await window.dirvo.scanFolder(id, path)
      if (outcome.status === 'done') {
        const explanation = await window.dirvo.explainFolder(outcome.result.path)
        setState({ status: 'idle' })
        onDoneRef.current({ metadata: outcome.result, explanation, aiStatus: 'none' })
      } else if (outcome.status === 'cancelled') {
        setState({ status: 'idle' })
      } else {
        setState({ status: 'error', message: outcome.message })
      }
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
