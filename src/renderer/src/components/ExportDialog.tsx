import { useState } from 'react'
import type { ReportFormat } from '@shared/types'
import Button from './Button'
import Modal from './Modal'

export interface ExportChoice {
  format: ReportFormat
  /** 'shown' is only offered while a search or filter is hiding some folders. */
  scope: 'all' | 'shown'
  redactUser: boolean
}

interface Props {
  totalCount: number
  /** How many folders the current search or filter shows. Null when nothing is hidden. */
  shownCount: number | null
  busy: boolean
  error: string | null
  onCancel: () => void
  onExport: (choice: ExportChoice) => void
}

const FORMATS: Array<{ id: ReportFormat; title: string; help: string }> = [
  { id: 'md', title: 'Markdown report', help: 'A readable summary with a detail section for each folder.' },
  { id: 'csv', title: 'CSV spreadsheet', help: 'One row per folder, for Excel or Google Sheets.' }
]

function Radio<T extends string>({
  name,
  value,
  current,
  onSelect,
  title,
  help
}: {
  name: string
  value: T
  current: T
  onSelect: (v: T) => void
  title: string
  help?: string
}): React.JSX.Element {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 transition-colors duration-150 ease-out-soft hover:bg-hover has-checked:border-line-strong has-checked:bg-raised">
      <input type="radio" name={name} value={value} checked={current === value} onChange={() => onSelect(value)} className="mt-0.5 accent-ink" />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        {help && <span className="mt-0.5 block text-xs text-ink-3">{help}</span>}
      </span>
    </label>
  )
}

/** Asks what to export. Nothing is written until you pick a file in the Windows save dialog. */
export default function ExportDialog({ totalCount, shownCount, busy, error, onCancel, onExport }: Props): React.JSX.Element {
  const [format, setFormat] = useState<ReportFormat>('md')
  const [scope, setScope] = useState<'all' | 'shown'>(shownCount === null ? 'all' : 'shown')
  const [redactUser, setRedactUser] = useState(true)

  return (
    <Modal titleId="export-title" onClose={onCancel} busy={busy}>
      <h2 id="export-title" className="text-xl font-medium">
        Export report
      </h2>
      <p className="mt-1 text-sm text-ink-2">Save the results to share them or keep a record.</p>

      <fieldset className="mt-5 flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-ink-2">Format</legend>
        {FORMATS.map((f) => (
          <Radio key={f.id} name="format" value={f.id} current={format} onSelect={setFormat} title={f.title} help={f.help} />
        ))}
      </fieldset>

      {shownCount !== null && (
        <fieldset className="mt-5 flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-ink-2">Folders</legend>
          <Radio name="scope" value="shown" current={scope} onSelect={setScope} title={`The ${shownCount} folders shown`} help="Matches your current search and filter." />
          <Radio name="scope" value="all" current={scope} onSelect={setScope} title={`All ${totalCount} folders`} />
        </fieldset>
      )}

      <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" checked={redactUser} onChange={(ev) => setRedactUser(ev.target.checked)} className="mt-0.5 accent-ink" />
        <span>
          Replace my Windows username with <code className="rounded bg-raised px-1 font-mono text-xs">&lt;USER&gt;</code>
          <span className="mt-0.5 block text-xs text-ink-3">Recommended if you will share the report. Paths in it show your username otherwise.</span>
        </span>
      </label>

      <p className="mt-5 text-xs text-ink-3">The report lists folder names, paths, sizes and dates. It never includes file contents.</p>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-bad-bg px-4 py-3 text-sm text-bad-ink">
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => onExport({ format, scope: shownCount === null ? 'all' : scope, redactUser })}>
          Choose where to save
        </Button>
      </div>
    </Modal>
  )
}
