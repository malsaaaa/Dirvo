import { parentPort } from 'node:worker_threads'
import { scanFolder, ScanCancelledError } from './scan-core'
import type { WorkerInMessage, WorkerOutMessage } from './messages'

if (!parentPort) throw new Error('worker.ts must run as a worker thread')
const port = parentPort

let cancelled = false
const send = (m: WorkerOutMessage): void => port.postMessage(m)

port.on('message', (msg: WorkerInMessage) => {
  if (msg.type === 'cancel') {
    cancelled = true
    return
  }
  scanFolder(msg.path, {
    isCancelled: () => cancelled,
    onProgress: (progress) => send({ type: 'progress', progress })
  })
    .then((result) => send({ type: 'done', result }))
    .catch((err: unknown) => {
      if (err instanceof ScanCancelledError) send({ type: 'cancelled' })
      else send({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    })
})
