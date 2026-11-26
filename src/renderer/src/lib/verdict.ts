import type { Verdict } from '@shared/types'

export interface VerdictStyle {
  label: string
  /** One line explaining what the verdict means. */
  meaning: string
  /** Full Tailwind class strings (kept literal so Tailwind can see them). */
  text: string
  banner: string
  dot: string
}

// Verdict colours are the only strong colour in the app. They mean something, so they stay.
export const VERDICT_STYLE: Record<Verdict, VerdictStyle> = {
  SAFE: {
    label: 'Safe to delete',
    meaning: 'Removing it will not harm anything of yours',
    text: 'text-emerald-800',
    banner: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    dot: 'bg-emerald-600'
  },
  REBUILDS_AUTOMATICALLY: {
    label: 'Rebuilds automatically',
    meaning: 'Safe to delete. The app that owns it will recreate it',
    text: 'text-sky-800',
    banner: 'bg-sky-50 border-sky-200 text-sky-900',
    dot: 'bg-sky-600'
  },
  CAUTION: {
    label: 'Be careful',
    meaning: 'Deleting it may remove settings or data. Check before you do',
    text: 'text-amber-800',
    banner: 'bg-amber-50 border-amber-200 text-amber-900',
    dot: 'bg-amber-600'
  },
  DONT_TOUCH: {
    label: "Don't touch",
    meaning: 'Windows, a program or your own data depends on it',
    text: 'text-red-800',
    banner: 'bg-red-50 border-red-200 text-red-900',
    dot: 'bg-red-600'
  }
}

export const UNKNOWN_STYLE = {
  label: 'Unknown',
  text: 'text-zinc-600',
  dot: 'bg-zinc-400'
}
