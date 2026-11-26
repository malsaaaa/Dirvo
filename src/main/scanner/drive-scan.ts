import type {
  DriveScanItem,
  DriveScanOutcome,
  DriveScanProgress,
  FolderExplanation,
  ScanOutcome,
  ScanProgress
} from '../../shared/types'

export const DEFAULT_MIN_BYTES = 50 * 1024 * 1024
export const DEFAULT_CONCURRENCY = 3

/** Everything the orchestrator needs from the outside world, so it can be tested with fakes. */
export interface DriveScanDeps {
  /** Subfolders of a folder. Must not include symlinks or junctions. Throws if unreadable. */
  listChildDirs: (path: string) => Promise<string[]>
  /** Starts a metadata scan of one folder in its own worker. */
  scanFolder: (path: string, onProgress: (p: ScanProgress) => void) => { promise: Promise<ScanOutcome>; cancel: () => void }
  explain: (path: string) => FolderExplanation | null
  /** Folders that mostly hold other folders (drive root, Windows, Users, AppData, ...): look inside them. */
  isContainer: (path: string) => boolean
}

export interface DriveScanCallbacks {
  onItem: (item: DriveScanItem) => void
  onProgress: (p: DriveScanProgress) => void
}

export interface DriveScanOptions {
  concurrency?: number
  minBytes?: number
  /** Minimum gap between progress callbacks. */
  progressIntervalMs?: number
}

export interface DriveScanHandle {
  promise: Promise<DriveScanOutcome>
  cancel: () => void
}

/**
 * Splits a drive into folders and scans each one, a few at a time.
 *
 * Container folders (the drive root, Windows, Users, a profile, AppData, ...) are not scanned as one
 * lump. Their subfolders are scanned instead, so the results show where the space really is.
 * Everything else is scanned whole. Files sitting directly inside container folders (pagefile.sys,
 * for example) are not listed. Folders under `minBytes` are counted, not listed.
 */
export function scanDrive(
  root: string,
  deps: DriveScanDeps,
  callbacks: DriveScanCallbacks,
  options: DriveScanOptions = {}
): DriveScanHandle {
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY)
  const minBytes = options.minBytes ?? DEFAULT_MIN_BYTES
  const interval = options.progressIntervalMs ?? 150

  const queue: string[] = [root]
  const inflight = new Map<string, { cancel: () => void; bytes: number }>()
  let active = 0
  let cancelled = false
  let foldersScanned = 0
  let doneBytes = 0
  let hiddenSmall = 0
  let skipped = 0
  let lastProgress = 0

  const emitProgress = (force = false): void => {
    const now = Date.now()
    if (!force && now - lastProgress < interval) return
    lastProgress = now
    let bytes = doneBytes
    for (const f of inflight.values()) bytes += f.bytes
    callbacks.onProgress({ foldersScanned, bytesScanned: bytes, current: [...inflight.keys()] })
  }

  async function handle(path: string): Promise<void> {
    if (deps.isContainer(path)) {
      try {
        const children = await deps.listChildDirs(path)
        queue.push(...children)
      } catch {
        skipped++
      }
      return
    }

    const scan = deps.scanFolder(path, (p) => {
      const f = inflight.get(path)
      if (f) f.bytes = p.bytesScanned
      emitProgress()
    })
    inflight.set(path, { cancel: scan.cancel, bytes: 0 })
    if (cancelled) scan.cancel()
    emitProgress()

    const outcome = await scan.promise
    inflight.delete(path)

    if (outcome.status === 'done') {
      foldersScanned++
      doneBytes += outcome.result.sizeBytes
      if (outcome.result.sizeBytes >= minBytes) {
        callbacks.onItem({ metadata: outcome.result, explanation: deps.explain(outcome.result.path) })
      } else {
        hiddenSmall++
      }
    } else if (outcome.status === 'error') {
      skipped++
    }
    emitProgress()
  }

  const promise = new Promise<DriveScanOutcome>((resolve) => {
    const pump = (): void => {
      while (!cancelled && active < concurrency && queue.length > 0) {
        const next = queue.shift() as string
        active++
        handle(next)
          .catch(() => {
            skipped++
          })
          .finally(() => {
            active--
            pump()
          })
      }
      // Finished when nothing is running and there is nothing left to start (or we were cancelled).
      if (active === 0 && (queue.length === 0 || cancelled)) {
        emitProgress(true)
        resolve(cancelled ? { status: 'cancelled' } : { status: 'done', foldersScanned, hiddenSmall, skipped, minBytes })
      }
    }

    pump()
  })

  return {
    promise,
    cancel: () => {
      cancelled = true
      for (const f of inflight.values()) f.cancel()
    }
  }
}
