import type { ScannedFolder } from '@shared/types'

const DAY_MS = 24 * 60 * 60 * 1000

/** A folder counts as idle after this long with no new or changed files. Shorter gaps are not worth mentioning. */
export const IDLE_NOTICE_DAYS = 90
/** The "untouched for over a year" line and filter use this. */
export const IDLE_YEAR_DAYS = 365

/**
 * Whole days since anything in the folder last changed: its newest file, or the folder's own date if it
 * holds no files. Null when no date is known. A date in the future (a clock set wrong) counts as zero.
 */
export function idleDays(item: ScannedFolder, now: number = Date.now()): number | null {
  const iso = item.metadata.newestFileAt ?? item.metadata.modifiedAt
  const t = iso ? Date.parse(iso) : NaN
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now - t) / DAY_MS))
}

/** True once a folder has been idle for at least `days`. Unknown dates are never counted as idle. */
export function isIdle(item: ScannedFolder, days: number, now: number = Date.now()): boolean {
  const d = idleDays(item, now)
  return d !== null && d >= days
}

export interface IdleLabel {
  /** For tight spaces like the ledger: "3 mo", "2 y". */
  short: string
  /** For sentences: "3 months", "1 year". */
  long: string
}

/** How to say a number of idle days. Null below the notice threshold, where it would only be noise. */
export function idleLabel(days: number | null): IdleLabel | null {
  if (days === null || days < IDLE_NOTICE_DAYS) return null
  if (days >= IDLE_YEAR_DAYS) {
    const years = Math.floor(days / IDLE_YEAR_DAYS)
    return { short: `${years} y`, long: `${years} year${years === 1 ? '' : 's'}` }
  }
  const months = Math.floor(days / 30)
  return { short: `${months} mo`, long: `${months} months` }
}
