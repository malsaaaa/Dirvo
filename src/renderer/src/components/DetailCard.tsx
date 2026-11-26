import { useState } from 'react'
import type { ScannedFolder } from '../hooks/useScanner'
import { formatBytes, formatCount, formatDate } from '../lib/format'
import { VERDICT_STYLE } from '../lib/verdict'
import VerdictBadge from './VerdictBadge'

const SOURCE_LABEL = {
  system: 'System rule',
  database: 'Dirvo database',
  ai: 'AI estimate'
} as const

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="mt-1 text-sm leading-relaxed text-slate-800">{children}</div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{value}</dd>
    </div>
  )
}

interface Props {
  item: ScannedFolder
  onRetryAi: () => void
  onOpenSettings: () => void
}

function UnknownPanel({ item, onRetryAi, onOpenSettings }: Props): React.JSX.Element {
  const base = 'rounded-lg border p-4 text-sm'
  if (item.aiStatus === 'loading') {
    return (
      <div className={`${base} border-indigo-200 bg-indigo-50 text-indigo-900`} aria-live="polite">
        <p className="font-semibold">Asking Claude about this folder…</p>
        <p className="mt-0.5">Only its name, size, counts and a few file names are sent. Never file contents.</p>
      </div>
    )
  }
  if (item.aiStatus === 'no-key') {
    return (
      <div className={`${base} border-slate-200 bg-slate-50 text-slate-700`}>
        <p className="font-semibold">Dirvo doesn&apos;t recognise this folder</p>
        <p className="mt-0.5">
          Add an Anthropic API key and Dirvo can ask Claude to explain it. Until then, treat it as important and check
          the file names below for clues.
        </p>
        <button onClick={onOpenSettings} className="mt-3 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500">
          Open Settings
        </button>
      </div>
    )
  }
  if (item.aiStatus === 'error') {
    return (
      <div role="alert" className={`${base} border-red-200 bg-red-50 text-red-900`}>
        <p className="font-semibold">Could not get an explanation</p>
        <p className="mt-0.5">{item.aiError}</p>
        <div className="mt-3 flex gap-2">
          <button onClick={onRetryAi} className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600">
            Try again
          </button>
          <button onClick={onOpenSettings} className="rounded-md border border-red-300 px-3 py-1.5 text-sm hover:bg-red-100">
            Open Settings
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className={`${base} border-slate-200 bg-slate-50 text-slate-700`}>
      <p className="font-semibold">Dirvo doesn&apos;t recognise this folder</p>
      <p className="mt-0.5">Treat it as important until you know what created it.</p>
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
    <article className="flex flex-col gap-5">
      <header>
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 break-words text-xl font-semibold tracking-tight">{m.name}</h2>
          <VerdictBadge verdict={e?.verdict ?? null} />
        </div>
        <p className="mt-1 break-all text-xs text-slate-500">{m.path}</p>
      </header>

      {e ? (
        <div className={`rounded-lg border p-4 ${VERDICT_STYLE[e.verdict].banner}`}>
          <p className="text-sm font-semibold">{VERDICT_STYLE[e.verdict].label}</p>
          <p className="mt-0.5 text-sm opacity-90">{VERDICT_STYLE[e.verdict].meaning}</p>
        </div>
      ) : (
        <UnknownPanel item={item} onRetryAi={onRetryAi} onOpenSettings={onOpenSettings} />
      )}

      {e && e.downgradedFrom && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          The AI was not confident, so Dirvo changed its verdict from &ldquo;{VERDICT_STYLE[e.downgradedFrom].label}&rdquo; to
          &ldquo;{VERDICT_STYLE[e.verdict].label}&rdquo;.
        </p>
      )}

      {e && (
        <div className="flex flex-col gap-4">
          <Section title="What it is">{e.whatItIs}</Section>
          <Section title="Created by">{e.createdBy}</Section>
          <Section title="If you delete it">{e.consequenceIfDeleted}</Section>
          <p className="text-xs text-slate-500">
            {SOURCE_LABEL[e.source]} · {e.confidence.toLowerCase()} confidence
            {e.source === 'ai' && ' · an estimate from metadata only, so double-check before deleting'}
          </p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <Stat label="Size" value={formatBytes(m.sizeBytes)} />
        <Stat label="Files" value={formatCount(m.fileCount)} />
        <Stat label="Subfolders" value={formatCount(m.dirCount)} />
        <Stat label="Created" value={formatDate(m.createdAt)} />
        <Stat label="Last changed" value={formatDate(m.modifiedAt)} />
        <Stat label="Newest file" value={formatDate(m.newestFileAt)} />
      </dl>

      {m.unreadableCount > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {formatCount(m.unreadableCount)} item{m.unreadableCount === 1 ? '' : 's'} could not be read (permissions), so
          the size may be higher than shown.
        </p>
      )}

      {topTypes.length > 0 && (
        <Section title="Top file types">
          <div className="flex flex-wrap gap-1.5">
            {topTypes.map(([ext, count]) => (
              <span key={ext} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                {ext} <span className="text-slate-500">× {formatCount(count)}</span>
              </span>
            ))}
          </div>
        </Section>
      )}

      {m.sampleFileNames.length > 0 && (
        <details className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <summary className="cursor-pointer select-none font-medium text-slate-700">
            Sample file names ({m.sampleFileNames.length})
          </summary>
          <ul className="mt-2 max-h-48 overflow-auto font-mono text-xs text-slate-600">
            {m.sampleFileNames.map((n, i) => (
              <li key={`${n}-${i}`} className="truncate">
                {n}
              </li>
            ))}
          </ul>
        </details>
      )}

      <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
        <button
          onClick={() => void window.dirvo.openInExplorer(m.path)}
          className="rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Open in Explorer
        </button>
        <button
          onClick={() => void copy()}
          className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Copy path
        </button>
        <span className="text-xs text-emerald-700" aria-live="polite">
          {feedback}
        </span>
        <span className="ml-auto text-xs text-slate-400">Dirvo never deletes anything.</span>
      </footer>
    </article>
  )
}
