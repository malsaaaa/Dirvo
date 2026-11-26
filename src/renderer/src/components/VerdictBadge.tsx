import type { Verdict } from '@shared/types'
import { UNKNOWN_STYLE, VERDICT_STYLE } from '../lib/verdict'

/** A status dot and a label. Quiet on purpose: the detail card's banner is where the verdict gets loud. */
export default function VerdictBadge({ verdict }: { verdict: Verdict | null }): React.JSX.Element {
  const style = verdict ? VERDICT_STYLE[verdict] : UNKNOWN_STYLE
  return (
    <span className={`inline-flex items-center gap-2 text-xs font-medium ${style.text}`}>
      <span className={`h-2 w-2 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  )
}
