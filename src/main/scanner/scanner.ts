import { Worker } from 'node:worker_threads'
import type { ScanOutcome, ScanProgress } from '../../shared/types'
import type { WorkerInMessage, WorkerOutMessage } from './messages'

const CANCEL_GRACE_MS = 3000

export interface ScanHandle {
  promise: Promise<ScanOutcome>
  cancel: () => void
}

/** Runs one scan in its own worker thread. `workerPath` is the built worker script. */
export function startScan(
  workerPath: string,
  folderPath: string,
  onProgress: (p: ScanProgress) => void
): ScanHandle {
  const worker = new Worker(workerPath)
  let killTimer: NodeJS.Timeout | undefined
  let settled = false
  let cancelRequested = false

  const promise = new Promise<ScanOutcome>((resolve) => {
    const finish = (outcome: ScanOutcome): void => {
      if (settled) return
      settled = true
      clearTimeout(killTimer)
      void worker.terminate()
      resolve(outcome)
    }

    worker.on('message', (m: WorkerOutMessage) => {
      switch (m.type) {
        case 'progress':
          if (!settled) onProgress(m.progress)
          break
        case 'done':
          finish({ status: 'done', result: m.result })
          break
        case 'cancelled':
          finish({ status: 'cancelled' })
          break
        case 'error':
          finish({ status: 'error', message: m.message })
          break
      }
    })
    worker.on('error', (err: Error) => finish({ status: 'error', message: err.message }))
    worker.on('exit', () =>
      finish(
        cancelRequested
          ? { status: 'cancelled' }
          : { status: 'error', message: 'Scanner stopped unexpectedly' }
      )
    )

    const start: WorkerInMessage = { type: 'start', path: folderPath }
    worker.postMessage(start)
  })

  return {
    promise,
    cancel: () => {
      if (settled || cancelRequested) return
      cancelRequested = true
      const msg: WorkerInMessage = { type: 'cancel' }
      worker.postMessage(msg)
      // If the worker is stuck in a slow filesystem call, don't wait forever.
      killTimer = setTimeout(() => void worker.terminate(), CANCEL_GRACE_MS)
    }
  }
}
