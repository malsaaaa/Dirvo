import type { Verdict } from '@shared/types'
import { UNKNOWN_STYLE, VERDICT_STYLE } from '../lib/verdict'

export default function VerdictBadge({ verdict }: { verdict: Verdict | null }): React.JSX.Element {
  const style = verdict ? VERDICT_STYLE[verdict] : UNKNOWN_STYLE
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  )
}
