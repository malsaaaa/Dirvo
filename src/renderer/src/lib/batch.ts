import type { ScannedFolder } from '@shared/types'

/** What happened when one folder was sent to the AI. */
export type ExplainOutcome = 'ok' | 'no-key' | 'error'

export interface BatchProgress {
  done: number
  total: number
  failed: number
}

/** What the results screen needs to offer "Explain unknown folders". */
export interface BatchControls {
  /** Unknown folders in all (a run covers at most `cap` of them). */
  unknownCount: number
  cap: number
  /** Progress while a run is going. */
  running: BatchProgress | null
  /** How the last run ended, until dismissed. */
  result: BatchSummary | null
  start: () => void
  cancel: () => void
  dismissResult: () => void
}

export interface BatchSummary {
  done: number
  ok: number
  failed: number
  /** Why it ended early, or null if it went through every folder. */
  stopped: null | 'no-key' | 'errors' | 'cancelled'
  total: number
}

/** At most this many folders per run, largest first, so one click can never run up a big bill. */
export const MAX_BATCH = 50
export const BATCH_CONCURRENCY = 2
/** This many failures in a row means something is wrong (bad key, rate limit, service down): stop asking. */
export const MAX_CONSECUTIVE_ERRORS = 3

/** Folders the AI could still explain: no answer yet and not being asked right now. Biggest first, capped. */
export function pickUnknown(items: ScannedFolder[], cap: number = MAX_BATCH): string[] {
  return items
    .filter((i) => !i.explanation && i.aiStatus !== 'loading')
    .sort((a, b) => b.metadata.sizeBytes - a.metadata.sizeBytes)
    .slice(0, cap)
    .map((i) => i.metadata.path)
}

export function countUnknown(items: ScannedFolder[]): number {
  return items.filter((i) => !i.explanation && i.aiStatus !== 'loading').length
}

/**
 * Asks about each folder, a couple at a time. It stops starting new requests as soon as there is no
 * key, after several failures in a row, or when cancelled. Requests already sent are allowed to finish.
 */
export async function runBatch(
  paths: string[],
  explain: (path: string) => Promise<ExplainOutcome>,
  options: {
    concurrency?: number
    maxConsecutiveErrors?: number
    isCancelled?: () => boolean
    onProgress?: (p: BatchProgress) => void
  } = {}
): Promise<BatchSummary> {
  const concurrency = Math.max(1, options.concurrency ?? BATCH_CONCURRENCY)
  const maxErrors = options.maxConsecutiveErrors ?? MAX_CONSECUTIVE_ERRORS
  const total = paths.length

  let next = 0
  let done = 0
  let ok = 0
  let failed = 0
  let consecutiveErrors = 0
  let stopped: BatchSummary['stopped'] = null

  const progress = (): void => options.onProgress?.({ done, total, failed })
  progress()

  const worker = async (): Promise<void> => {
    while (stopped === null && next < total) {
      if (options.isCancelled?.()) {
        stopped = 'cancelled'
        return
      }
      const path = paths[next++]
      let outcome: ExplainOutcome
      try {
        outcome = await explain(path)
      } catch {
        outcome = 'error'
      }
      done++
      if (outcome === 'ok') {
        ok++
        consecutiveErrors = 0
      } else if (outcome === 'no-key') {
        failed++
        stopped ??= 'no-key'
      } else {
        failed++
        consecutiveErrors++
        if (consecutiveErrors >= maxErrors) stopped ??= 'errors'
      }
      progress()
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()))
  if (stopped === null && options.isCancelled?.() && done < total) stopped = 'cancelled'
  return { done, ok, failed, stopped, total }
}
