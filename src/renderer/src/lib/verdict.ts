import type { Verdict } from '@shared/types'

export interface VerdictStyle {
  label: string
  /** Compact label for tight spaces like the ledger. */
  short: string
  /** One line explaining what the verdict means. */
  meaning: string
  /** Full Tailwind class strings (kept literal so Tailwind can see them). Colours come from theme tokens. */
  text: string
  banner: string
  /** Left edge colour of the ruling block. */
  bar: string
  dot: string
}

// Verdict colours are the only colour in the app. They mean something, so they stay.
export const VERDICT_STYLE: Record<Verdict, VerdictStyle> = {
  SAFE: {
    label: 'Safe to delete',
    short: 'Safe',
    meaning: 'Removing it will not harm anything of yours',
    text: 'text-ok-text',
    banner: 'bg-ok-bg border-ok-line text-ok-ink',
    bar: 'border-l-ok-dot',
    dot: 'bg-ok-dot'
  },
  REBUILDS_AUTOMATICALLY: {
    label: 'Rebuilds automatically',
    short: 'Rebuilds',
    meaning: 'Safe to delete. The app that owns it will recreate it',
    text: 'text-info-text',
    banner: 'bg-info-bg border-info-line text-info-ink',
    bar: 'border-l-info-dot',
    dot: 'bg-info-dot'
  },
  CAUTION: {
    label: 'Be careful',
    short: 'Careful',
    meaning: 'Deleting it may remove settings or data. Check before you do',
    text: 'text-warn-text',
    banner: 'bg-warn-bg border-warn-line text-warn-ink',
    bar: 'border-l-warn-dot',
    dot: 'bg-warn-dot'
  },
  DONT_TOUCH: {
    label: "Don't touch",
    short: "Don't touch",
    meaning: 'Windows, a program or your own data depends on it',
    text: 'text-bad-text',
    banner: 'bg-bad-bg border-bad-line text-bad-ink',
    bar: 'border-l-bad-dot',
    dot: 'bg-bad-dot'
  }
}

export const UNKNOWN_STYLE = {
  label: 'Unknown',
  short: 'Unknown',
  text: 'text-ink-2',
  dot: 'bg-faint'
}

/** Order used everywhere a total is split by verdict: most reclaimable first, unknown last. */
export const BUCKET_ORDER = ['SAFE', 'REBUILDS_AUTOMATICALLY', 'CAUTION', 'DONT_TOUCH', 'UNKNOWN'] as const
export type Bucket = (typeof BUCKET_ORDER)[number]
