import { useState } from 'react'
import type { ScannedFolder } from '../hooks/useScanner'
import { formatBytes, formatCount, formatDate } from '../lib/format'
import { VERDICT_STYLE } from '../lib/verdict'
import Button from './Button'

const SOURCE_LABEL = {
  system: 'System rule',
  database: 'Dirvo database',
  ai: 'AI estimate'
} as const

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section>
      <h3 className="text-sm font-medium text-ink-3">{title}</h3>
      <div className="mt-1 text-sm leading-relaxed text-ink">{children}</div>
    </section>
  )
}

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }): React.JSX.Element {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={`mt-1 text-base font-medium tabular-nums text-ink ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

interface Props {
  item: ScannedFolder
  onRetryAi: () => void
  onOpenSettings: () => void
}

const PANEL = 'rounded-xl border p-5 text-sm'

function UnknownPanel({ item, onRetryAi, onOpenSettings }: Props): React.JSX.Element {
  if (item.aiStatus === 'loading') {
    return (
      <div className={`${PANEL} border-line bg-surface`} aria-live="polite">
        <p className="font-medium">Asking Claude about this folder…</p>
        <p className="mt-1 text-ink-2">Only its name, size, counts and a few file names are sent. Never file contents.</p>
      </div>
    )
  }
  if (item.aiStatus === 'no-key') {
    return (
      <div className={`${PANEL} border-line bg-surface`}>
        <p className="font-medium">Dirvo doesn&apos;t recognise this folder</p>
        <p className="mt-1 text-ink-2">
          Add an Anthropic API key and Dirvo can ask Claude to explain it. Until then, treat it as important and check
          the file names below for clues.
        </p>
        <Button variant="primary" onClick={onOpenSettings} className="mt-4">
          Open Settings
        </Button>
      </div>
    )
  }
  if (item.aiStatus === 'error') {
    return (
      <div role="alert" className={`${PANEL} border-bad-line bg-bad-bg text-bad-ink`}>
        <p className="font-medium">Could not get an explanation</p>
        <p className="mt-1">{item.aiError}</p>
        <div className="mt-4 flex gap-2">
          <Button variant="primary" onClick={onRetryAi}>
            Try again
          </Button>
          <Button onClick={onOpenSettings}>Open Settings</Button>
        </div>
      </div>
    )
  }
  return (
    <div className={`${PANEL} border-line bg-surface`}>
      <p className="font-medium">Dirvo doesn&apos;t recognise this folder</p>
      <p className="mt-1 text-ink-2">Treat it as important until you know what created it, or ask Claude to take a look.</p>
      <Button variant="primary" onClick={onRetryAi} className="mt-4">
        Explain with AI
      </Button>
    </div>
  )
}

export default function DetailCard({ item, onRetryAi, onOpenSettings }: Props): React.JSX.Element {
  const { metadata: m, explanation: e } = item
  const [feedback, setFeedback] = useState('')

  const copy = async (): Promise<void> => {
    await window.dirvo.copyPath(m.path)
    setFeedback('Path copied')
    setTimeout(() => setFeedback(''), 1800)
  }

  const topTypes = Object.entries(m.extensionCounts).slice(0, 8)

  return (
    <article className="flex flex-col gap-6">
      <header>
        <h2 className="min-w-0 break-words text-xl font-medium">{m.name}</h2>
        <p className="mt-1 break-all font-mono text-xs text-ink-3">{m.path}</p>
      </header>

      {e ? (
        <div className={`rounded-xl border p-5 ${VERDICT_STYLE[e.verdict].banner}`}>
          <p className="text-base font-medium">{VERDICT_STYLE[e.verdict].label}</p>
          <p className="mt-1 text-sm">{VERDICT_STYLE[e.verdict].meaning}</p>
        </div>
      ) : (
        <UnknownPanel item={item} onRetryAi={onRetryAi} onOpenSettings={onOpenSettings} />
      )}

      {e && e.downgradedFrom && (
        <p className="rounded-lg bg-warn-bg px-4 py-3 text-xs text-warn-ink">
          The AI was not confident, so Dirvo changed its verdict from &ldquo;{VERDICT_STYLE[e.downgradedFrom].label}&rdquo; to
          &ldquo;{VERDICT_STYLE[e.verdict].label}&rdquo;
        </p>
      )}

      {e && (
        <div className="flex flex-col gap-4">
          <Section title="What it is">{e.whatItIs}</Section>
          <Section title="Created by">{e.createdBy}</Section>
          <Section title="If you delete it">{e.consequenceIfDeleted}</Section>
          <p className="text-xs text-ink-3">
            {SOURCE_LABEL[e.source]} · {e.confidence.toLowerCase()} confidence
            {e.source === 'ai' && ' · an estimate from metadata only, so double-check before deleting'}
          </p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border border-line bg-surface p-5 sm:grid-cols-3">
        <Stat label="Size" value={formatBytes(m.sizeBytes)} mono />
        <Stat label="Files" value={formatCount(m.fileCount)} mono />
        <Stat label="Subfolders" value={formatCount(m.dirCount)} mono />
        <Stat label="Created" value={formatDate(m.createdAt)} />
        <Stat label="Last changed" value={formatDate(m.modifiedAt)} />
        <Stat label="Newest file" value={formatDate(m.newestFileAt)} />
      </dl>

      {m.unreadableCount > 0 && (
        <p className="rounded-lg bg-warn-bg px-4 py-3 text-xs text-warn-ink">
          {formatCount(m.unreadableCount)} item{m.unreadableCount === 1 ? '' : 's'} could not be read (permissions), so
          the size may be higher than shown
        </p>
      )}

      {topTypes.length > 0 && (
        <Section title="Top file types">
          <ul className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-ink-2">
            {topTypes.map(([ext, count]) => (
              <li key={ext}>
                {ext} <span className="tabular-nums text-ink-3">× {formatCount(count)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {m.sampleFileNames.length > 0 && (
        <details className="rounded-xl border border-line bg-surface p-4 text-sm">
          <summary className="cursor-pointer select-none font-medium text-ink">
            Sample file names <span className="font-mono text-xs tabular-nums text-ink-3">{m.sampleFileNames.length}</span>
          </summary>
          <ul className="mt-3 max-h-48 overflow-auto font-mono text-xs text-ink-2">
            {m.sampleFileNames.map((n, i) => (
              <li key={`${n}-${i}`} className="truncate leading-6">
                {n}
              </li>
            ))}
          </ul>
        </details>
      )}

      <footer className="flex flex-wrap items-center gap-2 border-t border-line pt-6">
        <Button onClick={() => void window.dirvo.openInExplorer(m.path)}>Open in Explorer</Button>
        <Button onClick={() => void copy()}>Copy path</Button>
        <span className="text-xs text-ok-text" aria-live="polite">
          {feedback}
        </span>
        <span className="ml-auto text-xs text-ink-3">Dirvo never deletes anything</span>
      </footer>
    </article>
  )
}
