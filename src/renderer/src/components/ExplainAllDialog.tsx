import { useEffect, useState } from 'react'
import { getProvider, hostOf, isLoopbackUrl } from '@shared/providers'
import type { AiConfig } from '@shared/types'
import Button from './Button'
import Modal from './Modal'

interface Props {
  /** How many folders this run will ask about (already capped). */
  count: number
  /** How many unknown folders there are in all. */
  unknownCount: number
  onConfirm: () => void
  onCancel: () => void
  onOpenSettings: () => void
}

/**
 * Nothing is sent until the user confirms here. It says how many folders, to whom, and exactly what
 * is shared, because a run can send dozens of folders at once.
 */
export default function ExplainAllDialog({ count, unknownCount, onConfirm, onCancel, onOpenSettings }: Props): React.JSX.Element {
  const [cfg, setCfg] = useState<AiConfig | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.dirvo.getAiConfig().then((c) => {
      if (!cancelled) setCfg(c)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const provider = cfg ? getProvider(cfg.provider) : undefined
  const needsKey = provider?.keyMode === 'required' && !cfg?.hasKey
  const local = cfg ? isLoopbackUrl(cfg.baseUrl) : false

  return (
    <Modal titleId="explain-all-title" onClose={onCancel}>
      <h2 id="explain-all-title" className="text-xl font-medium">
        Explain unknown folders
      </h2>

      {!cfg || !provider ? (
        <p className="mt-3 text-sm text-ink-3">Checking your AI settings…</p>
      ) : needsKey ? (
        <>
          <p className="mt-3 text-sm text-ink-2">
            There is no API key saved for {provider.label}. Add one in Settings, or pick a provider that runs on this PC.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button onClick={onCancel}>Cancel</Button>
            <Button variant="primary" onClick={onOpenSettings}>
              Open Settings
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-ink-2">
            Dirvo will ask <span className="font-medium text-ink">{provider.label}</span> to explain{' '}
            <span className="font-mono tabular-nums text-ink">{count}</span> folder{count === 1 ? '' : 's'}, largest first.
            {unknownCount > count && ` There are ${unknownCount} in all. Run it again for the rest.`}
          </p>

          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-ink-2">
            <li>
              For each folder it sends the name and path (your Windows username hidden), size, counts, dates and up to 30 sample
              file names. Never file contents.
            </li>
            <li>
              {local ? (
                <>
                  The model runs on this PC (<span className="font-mono text-xs">{hostOf(cfg.baseUrl)}</span>), so nothing leaves it.
                </>
              ) : (
                <>
                  They go to <span className="font-mono text-xs">{hostOf(cfg.baseUrl)}</span>, under that service&apos;s own terms. This uses
                  your own key and may cost money.
                </>
              )}
            </li>
            <li>Two are asked at a time. It stops by itself if something goes wrong, and you can cancel at any point.</li>
          </ul>

          <div className="mt-6 flex justify-end gap-2">
            <Button onClick={onCancel}>Cancel</Button>
            <Button variant="primary" onClick={onConfirm}>
              Explain {count} folder{count === 1 ? '' : 's'}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}
