import type { Verdict } from '@shared/types'

export interface VerdictStyle {
  label: string
  /** One line explaining what the verdict means. */
  meaning: string
  /** Full Tailwind class strings (kept literal so Tailwind can see them). */
  badge: string
  banner: string
  dot: string
}

export const VERDICT_STYLE: Record<Verdict, VerdictStyle> = {
  SAFE: {
    label: 'Safe to delete',
    meaning: 'Removing it will not harm anything of yours.',
    badge: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    banner: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    dot: 'bg-emerald-500'
  },
  REBUILDS_AUTOMATICALLY: {
    label: 'Rebuilds automatically',
    meaning: 'Safe to delete. The app that owns it will recreate it.',
    badge: 'bg-sky-100 text-sky-800 ring-sky-200',
    banner: 'bg-sky-50 border-sky-200 text-sky-900',
    dot: 'bg-sky-500'
  },
  CAUTION: {
    label: 'Be careful',
    meaning: 'Deleting it may remove settings or data. Check before you do.',
    badge: 'bg-amber-100 text-amber-800 ring-amber-200',
    banner: 'bg-amber-50 border-amber-200 text-amber-900',
    dot: 'bg-amber-500'
  },
  DONT_TOUCH: {
    label: "Don't touch",
    meaning: 'Windows, a program or your own data depends on it.',
    badge: 'bg-red-100 text-red-800 ring-red-200',
    banner: 'bg-red-50 border-red-200 text-red-900',
    dot: 'bg-red-500'
  }
}

export const UNKNOWN_STYLE = {
  label: 'Unknown',
  badge: 'bg-slate-100 text-slate-700 ring-slate-200',
  dot: 'bg-slate-400'
}
