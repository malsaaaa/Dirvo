import { useEffect, useState } from 'react'
import type { FolderExplanation, LargeFile } from '@shared/types'
import type { BreakdownControls } from '../hooks/useDriveScan'
import type { ScannedFolder } from '../hooks/useScanner'
import { formatBytes, formatCount, formatDate, formatDateTime, formatDelta } from '../lib/format'
import { idleDays, idleLabel } from '../lib/age'
import { deltaOf } from '../lib/history'
import { normPath } from '../lib/tree'
import { VERDICT_STYLE } from '../lib/verdict'
import Button from './Button'
import VerdictBadge from './VerdictBadge'

const SOURCE_LABEL = {
  system: 'System rule',
  database: 'Dirvo database',
  ai: 'AI estimate'
} as const

/** One line of the tag: a muted label on the left, the value on the right. */
function Row({ label, children, mono = false }: { label: string; children: React.ReactNode; mono?: boolean }): React.JSX.Element {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-4 py-3">
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd className={`text-sm leading-relaxed text-ink ${mono ? 'font-mono tabular-nums' : ''}`}>{children}</dd>
    </div>
  )
}

/** What the card can do with the files inside a folder. */
export interface FileActions {
  /** Add one file to the results and explain it. */
  explain: (path: string) => void
  /** The file is already in the results. */
  isListed: (path: string) => boolean
  /** Select a file that is already in the results. */
  select: (path: string) => void
}

interface Props {
  item: ScannedFolder
  onRetryAi: () => void
  onOpenSettings: () => void
  breakdown: BreakdownControls
  onRescan: () => void
  files: FileActions
}

const PANEL = 'rounded-lg border p-4 text-sm'

function UnknownPanel({ item, onRetryAi, onOpenSettings }: Pick<Props, 'item' | 'onRetryAi' | 'onOpenSettings'>): React.JSX.Element {
  const isFile = item.metadata.kind === 'file'
  const noun = isFile ? 'file' : 'folder'
  if (item.aiStatus === 'loading') {
    return (
      <div className={`${PANEL} border-line bg-hover`} aria-live="polite">
        <p className="font-medium">Asking the AI about this {noun}…</p>
        <p className="mt-1 text-ink-2">
          {isFile
            ? 'Only its name, location, size and dates are sent. Never what is inside the file.'
            : 'Only its name, size, counts and a few file names are sent. Never file contents.'}
        </p>
      </div>
    )
  }
  if (item.aiStatus === 'no-key') {
    return (
      <div className={`${PANEL} border-line bg-hover`}>
        <p className="font-medium">Dirvo doesn&apos;t recognise this {noun}</p>
        <p className="mt-1 text-ink-2">
          Add an API key for an AI provider in Settings and Dirvo can ask it to explain this {noun}. Until then, treat it
          as important{isFile ? '' : ' and check the file names below for clues'}.
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
    <div className={`${PANEL} border-line bg-hover`}>
      <p className="font-medium">Dirvo doesn&apos;t recognise this {noun}</p>
      <p className="mt-1 text-ink-2">Treat it as important until you know what created it, or ask the AI to take a look.</p>
      <Button variant="primary" onClick={onRetryAi} className="mt-4">
        Explain with AI
      </Button>
    </div>
  )
}

/**
 * "Look inside": scans each folder directly inside this one, so a big unknown folder is split into
 * parts that can be recognised and ruled on separately. They appear under it in the ledger.
 */
function InsideRow({ item, breakdown }: { item: ScannedFolder; breakdown: BreakdownControls }): React.JSX.Element {
  const m = item.metadata
  const running = breakdown.runningPath === m.path
  const inside = item.lookedInside

  if (running) {
    return (
      <div aria-live="polite">
        <p>Looking inside…</p>
        <p className="mt-1 font-mono text-xs tabular-nums text-ink-3">
          {formatCount(breakdown.foldersScanned)} scanned · {formatCount(breakdown.listed)} listed
        </p>
        <Button className="mt-3 h-8 px-3 text-xs" onClick={breakdown.cancel}>
          Cancel
        </Button>
      </div>
    )
  }

  if (inside) {
    return (
      <div>
        <p>
          {inside.listed > 0
            ? `${formatCount(inside.listed)} item${inside.listed === 1 ? '' : 's'} listed under it in the results`
            : 'Nothing inside is big enough to list'}
        </p>
        {(inside.hiddenSmall > 0 || inside.skipped > 0) && (
          <p className="mt-1 text-xs text-ink-3">
            {inside.hiddenSmall > 0 && `${formatCount(inside.hiddenSmall)} smaller folder${inside.hiddenSmall === 1 ? '' : 's'} left out. `}
            {inside.skipped > 0 && `${formatCount(inside.skipped)} could not be read (permissions).`}
          </p>
        )}
      </div>
    )
  }

  return (
    <div>
      <p className="text-ink-2">
        {formatCount(m.dirCount)} folder{m.dirCount === 1 ? '' : 's'} inside. Scan each one to see which parts can be cleaned.
      </p>
      <Button className="mt-3 h-8 px-3 text-xs" onClick={() => breakdown.start(m.path, m.sizeBytes)} disabled={breakdown.busy}>
        Look inside
      </Button>
      {breakdown.busy && <p className="mt-2 text-xs text-ink-3">Another scan is running</p>}
    </div>
  )
}

/** The file's path below the folder, so the list shows where each one sits. */
function relativeTo(folder: string, file: string): string {
  const base = folder.replace(/[\\/]+$/, '')
  return normPath(file).startsWith(normPath(base) + '\\') ? file.slice(base.length + 1) : file
}

/**
 * The biggest single files inside a folder, noted during the scan. Each shows Dirvo's offline ruling, and
 * can be added to the results to get the full explanation (or an AI estimate if Dirvo does not know it).
 */
function LargestFiles({ folder, files, actions }: { folder: string; files: LargeFile[]; actions: FileActions }): React.JSX.Element {
  const [rulings, setRulings] = useState<Array<FolderExplanation | null> | null>(null)
  useEffect(() => {
    let off = false
    window.dirvo
      .explainFiles(files.map((f) => f.path))
      .then((r) => {
        if (!off) setRulings(r)
      })
      .catch(() => undefined)
    return () => {
      off = true
    }
  }, [files])

  return (
    <ul className="flex flex-col divide-y divide-line">
      {files.map((f, i) => {
        const listed = actions.isListed(f.path)
        return (
          <li key={f.path} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm" title={f.path}>
                {relativeTo(folder, f.path)}
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-ink-2">{formatBytes(f.sizeBytes)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-3">
              {rulings ? <VerdictBadge verdict={rulings[i]?.verdict ?? null} short /> : <span />}
              <Button className="h-7 px-2.5 text-xs" onClick={() => (listed ? actions.select(f.path) : actions.explain(f.path))}>
                {listed ? 'Show' : 'Explain'}
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export default function DetailCard({ item, onRetryAi, onOpenSettings, breakdown, onRescan, files }: Props): React.JSX.Element {
  const { metadata: m, explanation: e } = item
  const [feedback, setFeedback] = useState('')

  const flash = (message: string): void => {
    setFeedback(message)
    setTimeout(() => setFeedback(''), 1800)
  }

  const copy = async (): Promise<void> => {
    await window.dirvo.copyPath(m.path)
    flash('Path copied')
  }

  const copyCommand = async (command: string | undefined): Promise<void> => {
    if (!command) return
    await window.dirvo.copyCommand(command)
    flash('Command copied. Paste it into a terminal to run it')
  }

  const isFile = m.kind === 'file'
  const topTypes = Object.entries(m.extensionCounts).slice(0, 8)
  const fileType = Object.keys(m.extensionCounts)[0]
  const delta = deltaOf(item)
  const idle = idleLabel(idleDays(item))

  return (
    <article className="flex flex-col gap-5">
      <header>
        <h2 className="min-w-0 break-words text-xl font-medium">{m.name}</h2>
        <p className="mt-2 break-all font-mono text-xs leading-relaxed text-ink-3">{m.path}</p>
      </header>

      {breakdown.rescan && normPath(breakdown.rescan.path) === normPath(m.path) && (
        // A rescan shows its progress here, because the scan screen is not on view.
        <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-hover px-4 py-3" aria-live="polite">
          <div className="min-w-0">
            <p className="text-sm font-medium">Rescanning…</p>
            <p className="mt-0.5 font-mono text-xs tabular-nums text-ink-3">
              {formatCount(breakdown.rescan.filesScanned)} files · {formatBytes(breakdown.rescan.bytesScanned)} so far
            </p>
          </div>
          <Button className="h-8 px-3 text-xs" onClick={breakdown.cancelRescan}>
            Cancel
          </Button>
        </div>
      )}

      {e ? (
        // The ruling: the answer to "can I delete this?", with the verdict colour down its left edge.
        <div className={`rounded-lg border border-l-4 p-4 ${VERDICT_STYLE[e.verdict].banner} ${VERDICT_STYLE[e.verdict].bar}`}>
          <p className="text-base font-medium">{VERDICT_STYLE[e.verdict].label}</p>
          <p className="mt-1 text-sm">{VERDICT_STYLE[e.verdict].meaning}</p>
        </div>
      ) : (
        <UnknownPanel item={item} onRetryAi={onRetryAi} onOpenSettings={onOpenSettings} />
      )}

      {e && e.downgradedFrom && (
        <p className="rounded-lg bg-warn-bg px-4 py-3 text-xs leading-relaxed text-warn-ink">
          {e.downgradeReason === 'contradiction'
            ? 'The AI called this safe, but its own explanation says deleting it can cause problems, so Dirvo changed its verdict'
            : 'The AI was not confident, so Dirvo changed its verdict'}{' '}
          from &ldquo;{VERDICT_STYLE[e.downgradedFrom].label}&rdquo; to &ldquo;{VERDICT_STYLE[e.verdict].label}&rdquo;
        </p>
      )}

      <dl className="divide-y divide-line border-y border-line">
        {e && (
          <>
            <Row label="What it is">{e.whatItIs}</Row>
            <Row label="Made by">{e.createdBy}</Row>
            <Row label="If deleted">{e.consequenceIfDeleted}</Row>
            {e.howToClean && (
              <Row label="To clean">
                <p>{e.howToClean.text}</p>
                {e.howToClean.command && (
                  <div className="mt-3 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-page px-2.5 py-1.5 font-mono text-xs" title={e.howToClean.command}>
                      {e.howToClean.command}
                    </code>
                    <Button className="h-8 px-3 text-xs" onClick={() => void copyCommand(e.howToClean?.command)}>
                      Copy
                    </Button>
                  </div>
                )}
                {e.howToClean.settings && (
                  <Button className="mt-3 h-8 px-3 text-xs" onClick={() => void window.dirvo.openSettings(e.howToClean?.settings ?? 'storage')}>
                    {e.howToClean.settings === 'apps' ? 'Open Apps settings' : 'Open Storage settings'}
                  </Button>
                )}
              </Row>
            )}
          </>
        )}
        {!isFile && m.dirCount > 0 && (
          <Row label="Inside">
            <InsideRow item={item} breakdown={breakdown} />
          </Row>
        )}
        {!isFile && m.largestFiles && m.largestFiles.length > 0 && (
          <Row label="Biggest files">
            <LargestFiles folder={m.path} files={m.largestFiles} actions={files} />
          </Row>
        )}
        <Row label="Size" mono>
          {formatBytes(m.sizeBytes)}
          {delta && (
            <span className="ml-2 font-sans text-xs text-ink-3">
              {formatDelta(delta.bytes)} since {formatDateTime(delta.since)}
            </span>
          )}
        </Row>
        {isFile ? (
          <Row label="Type" mono>
            {fileType && fileType !== '(none)' ? fileType : 'No extension'}
          </Row>
        ) : (
          <Row label="Contents" mono>
            {formatCount(m.fileCount)} files · {formatCount(m.dirCount)} folders
          </Row>
        )}
        <Row label="Scanned">{formatDateTime(item.scannedAt)}</Row>
        <Row label="Created">{formatDate(m.createdAt)}</Row>
        <Row label="Changed">
          {formatDate(m.modifiedAt)}
          {!isFile && <span className="text-ink-3"> · newest file {formatDate(m.newestFileAt)}</span>}
        </Row>
        {idle && <Row label="Idle">{isFile ? 'Not changed for' : 'Nothing in it has changed for'} {idle.long}</Row>}
        {!isFile && topTypes.length > 0 && (
          <Row label="File types" mono>
            <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
              {topTypes.map(([ext, count]) => (
                <span key={ext}>
                  {ext} <span className="text-ink-3">×{formatCount(count)}</span>
                </span>
              ))}
            </span>
          </Row>
        )}
        {e && (
          <Row label="Source">
            <span className="text-ink-2">
              {SOURCE_LABEL[e.source]} · {e.confidence.toLowerCase()} confidence
            </span>
            {e.source === 'ai' && <span className="mt-1 block text-xs text-ink-3">An estimate from metadata only, so double-check before deleting</span>}
          </Row>
        )}
      </dl>

      {m.unreadableCount > 0 && (
        <p className="rounded-lg bg-warn-bg px-4 py-3 text-xs leading-relaxed text-warn-ink">
          {formatCount(m.unreadableCount)} item{m.unreadableCount === 1 ? '' : 's'} could not be read (permissions), so
          the size may be higher than shown
        </p>
      )}

      {!isFile && m.sampleFileNames.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer select-none text-ink-2 hover:text-ink">
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

      <footer className="flex flex-wrap items-center gap-2 pt-1">
        <Button onClick={() => void window.dirvo.openInExplorer(m.path)}>Open in Explorer</Button>
        <Button onClick={() => void copy()}>Copy path</Button>
        <Button onClick={onRescan} disabled={breakdown.busy}>
          Rescan
        </Button>
        <span className="text-xs text-ok-text" aria-live="polite">
          {feedback}
        </span>
      </footer>
      <p className="text-xs text-ink-3">Dirvo never deletes anything</p>
    </article>
  )
}
