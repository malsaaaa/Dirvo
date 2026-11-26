import type { Verdict } from '@shared/types'

export interface VerdictStyle {
  label: string
  /** One line explaining what the verdict means. */
  meaning: string
  /** Full Tailwind class strings (kept literal so Tailwind can see them). Colours come from theme tokens. */
  text: string
  banner: string
  dot: string
}

// Verdict colours are the only strong colour in the app. They mean something, so they stay.
export const VERDICT_STYLE: Record<Verdict, VerdictStyle> = {
  SAFE: {
    label: 'Safe to delete',
    meaning: 'Removing it will not harm anything of yours',
    text: 'text-ok-text',
    banner: 'bg-ok-bg border-ok-line text-ok-ink',
    dot: 'bg-ok-dot'
  },
  REBUILDS_AUTOMATICALLY: {
    label: 'Rebuilds automatically',
    meaning: 'Safe to delete. The app that owns it will recreate it',
    text: 'text-info-text',
    banner: 'bg-info-bg border-info-line text-info-ink',
    dot: 'bg-info-dot'
  },
  CAUTION: {
    label: 'Be careful',
    meaning: 'Deleting it may remove settings or data. Check before you do',
    text: 'text-warn-text',
    banner: 'bg-warn-bg border-warn-line text-warn-ink',
    dot: 'bg-warn-dot'
  },
  DONT_TOUCH: {
    label: "Don't touch",
    meaning: 'Windows, a program or your own data depends on it',
    text: 'text-bad-text',
    banner: 'bg-bad-bg border-bad-line text-bad-ink',
    dot: 'bg-bad-dot'
  }
}

export const UNKNOWN_STYLE = {
  label: 'Unknown',
  text: 'text-ink-2',
  dot: 'bg-faint'
}
