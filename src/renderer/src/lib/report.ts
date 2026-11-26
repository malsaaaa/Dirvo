import type { ReportFormat } from '@shared/types'
import { formatBytes, formatDateTime, formatDelta } from './format'
import { idleDays, idleLabel } from './age'
import { changesSince, deltaOf } from './history'
import { summarize } from './summary'
import type { LedgerRow } from './tree'
import { BUCKET_ORDER, UNKNOWN_STYLE, VERDICT_STYLE, type Bucket } from './verdict'

const BUCKET_LABEL: Record<Bucket, string> = {
  SAFE: VERDICT_STYLE.SAFE.label,
  REBUILDS_AUTOMATICALLY: VERDICT_STYLE.REBUILDS_AUTOMATICALLY.label,
  CAUTION: VERDICT_STYLE.CAUTION.label,
  DONT_TOUCH: VERDICT_STYLE.DONT_TOUCH.label,
  UNKNOWN: UNKNOWN_STYLE.label
}

const SOURCE_LABEL = { system: 'System rule', database: 'Dirvo database', ai: 'AI estimate' } as const

function rulingText(row: LedgerRow): string {
  const e = row.item.explanation
  return e ? VERDICT_STYLE[e.verdict].label : 'Unknown'
}

function settingsText(target: 'storage' | 'apps'): string {
  return target === 'apps' ? 'Windows Settings > Apps' : 'Windows Settings > System > Storage'
}

// ---------------------------------------------------------------- Markdown

/** A code span that survives backticks inside the text. Names and paths always go in one, so nothing renders as markup. */
export function mdCode(text: string): string {
  const clean = text.replace(/[\r\n]+/g, ' ')
  const longest = Math.max(0, ...(clean.match(/`+/g) ?? []).map((r) => r.length))
  const fence = '`'.repeat(longest + 1)
  const pad = clean.startsWith('`') || clean.endsWith('`') ? ' ' : ''
  return `${fence}${pad}${clean}${pad}${fence}`
}

/** Plain text for a table cell: no pipes, no line breaks, no raw HTML. */
export function mdCell(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .trim()
}

const MAX_DETAILS = 200

function buildMarkdown(rows: LedgerRow[], now: Date): string {
  const items = rows.map((r) => r.item)
  const summary = summarize(items, now.getTime())
  const change = changesSince(items)
  const lines: string[] = []

  lines.push('# Dirvo report', '')
  lines.push(`Generated ${formatDateTime(now.toISOString(), now)} · ${summary.count} folder${summary.count === 1 ? '' : 's'} · ${formatBytes(summary.totalBytes)} scanned`, '')

  lines.push('## Summary', '')
  lines.push(
    summary.reclaimableCount > 0
      ? `**${formatBytes(summary.reclaimableBytes)} can be reclaimed**, in ${summary.reclaimableCount} of ${summary.count} folders rated Safe or Rebuilds. Check each folder before you delete anything. Dirvo never deletes anything.`
      : `None of the ${summary.count} folders is rated Safe or Rebuilds. Dirvo never deletes anything.`,
    ''
  )
  if (summary.idleReclaimableBytes > 0) {
    lines.push(`${formatBytes(summary.idleReclaimableBytes)} of that is in folders nothing has touched for over a year.`, '')
  }
  if (change) {
    lines.push(`Since ${formatDateTime(change.since, now)}: **${formatDelta(change.bytes)}**${change.changed > 0 ? ` across ${change.changed} changed folder${change.changed === 1 ? '' : 's'}` : ''}.`, '')
  }
  lines.push('| Ruling | Folders | Space |', '| --- | ---: | ---: |')
  for (const b of BUCKET_ORDER) {
    if (summary.byBucket[b].count === 0) continue
    lines.push(`| ${BUCKET_LABEL[b]} | ${summary.byBucket[b].count} | ${formatBytes(summary.byBucket[b].bytes)} |`)
  }
  lines.push('')

  lines.push('## Folders', '')
  if (rows.length === 0) {
    lines.push('No folders.', '')
  } else {
    lines.push('| Folder | Size | Ruling | Made by | Change |', '| --- | ---: | --- | --- | ---: |')
    for (const row of rows) {
      const m = row.item.metadata
      const d = deltaOf(row.item)
      const indent = row.depth > 0 ? `${'&nbsp;&nbsp;'.repeat(row.depth - 1)}↳ ` : ''
      lines.push(
        `| ${indent}${mdCode(m.name)} | ${formatBytes(m.sizeBytes)} | ${rulingText(row)} | ${mdCell(row.item.explanation?.createdBy ?? '')} | ${d ? formatDelta(d.bytes) : ''} |`
      )
    }
    lines.push('')
  }

  if (rows.length > 0) {
    lines.push('## Details', '')
    for (const row of rows.slice(0, MAX_DETAILS)) {
      const { metadata: m, explanation: e } = row.item
      lines.push(`### ${mdCode(m.name)}`, '')
      lines.push(`- **Path:** ${mdCode(m.path)}`)
      lines.push(`- **Size:** ${formatBytes(m.sizeBytes)} · ${m.fileCount.toLocaleString('en-US')} files · ${m.dirCount.toLocaleString('en-US')} folders`)
      if (e) {
        const how = e.source === 'ai' ? ` (AI estimate, ${e.confidence.toLowerCase()} confidence)` : e.source === 'system' ? ' (system rule)' : ''
        lines.push(`- **Ruling:** ${VERDICT_STYLE[e.verdict].label}${how}. ${VERDICT_STYLE[e.verdict].meaning}.`)
        lines.push(`- **What it is:** ${mdCell(e.whatItIs)}`)
        lines.push(`- **Made by:** ${mdCell(e.createdBy)}`)
        lines.push(`- **If deleted:** ${mdCell(e.consequenceIfDeleted)}`)
        if (e.howToClean) {
          lines.push(`- **To clean:** ${mdCell(e.howToClean.text)}`)
          if (e.howToClean.command) lines.push(`  - Command: ${mdCode(e.howToClean.command)}`)
          if (e.howToClean.settings) lines.push(`  - Open: ${settingsText(e.howToClean.settings)}`)
        }
        lines.push(`- **Source:** ${SOURCE_LABEL[e.source]}`)
      } else {
        lines.push('- **Ruling:** Unknown. Dirvo does not recognise this folder, so treat it as important.')
      }
      const idle = idleLabel(idleDays(row.item, now.getTime()))
      if (idle) lines.push(`- **Idle:** nothing in it has changed for ${idle.long}`)
      const d = deltaOf(row.item)
      if (d) lines.push(`- **Change:** ${formatDelta(d.bytes)} since ${formatDateTime(d.since, now)}`)
      lines.push(`- **Scanned:** ${formatDateTime(row.item.scannedAt, now)}`, '')
    }
    if (rows.length > MAX_DETAILS) lines.push(`_Details are shown for the first ${MAX_DETAILS} of ${rows.length} folders._`, '')
  }

  lines.push('---', '', '_Made with Dirvo. It reads only folder names, sizes and dates, never file contents._', '')
  return lines.join('\n')
}

// --------------------------------------------------------------------- CSV

/**
 * One CSV cell, quoted when needed (RFC 4180). A cell that starts with = + - @ (or a tab or return) would
 * run as a formula in Excel or Sheets, and folder names are not trusted, so those get a leading apostrophe.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const CSV_HEADER = [
  'Folder',
  'Path',
  'Size (bytes)',
  'Size',
  'Ruling',
  'Confidence',
  'Source',
  'Made by',
  'What it is',
  'If deleted',
  'To clean',
  'Command',
  'Files',
  'Folders',
  'Created',
  'Last changed',
  'Newest file',
  'Scanned',
  'Change since last scan (bytes)',
  'Days idle'
]

function buildCsv(rows: LedgerRow[], now: Date): string {
  const lines = [CSV_HEADER.map(csvCell).join(',')]
  for (const row of rows) {
    const { metadata: m, explanation: e } = row.item
    const d = deltaOf(row.item)
    const idle = idleDays(row.item, now.getTime())
    lines.push(
      [
        m.name,
        m.path,
        m.sizeBytes,
        formatBytes(m.sizeBytes),
        rulingText(row),
        e?.confidence ?? '',
        e ? SOURCE_LABEL[e.source] : '',
        e?.createdBy ?? '',
        e?.whatItIs ?? '',
        e?.consequenceIfDeleted ?? '',
        e?.howToClean?.text ?? '',
        e?.howToClean?.command ?? '',
        m.fileCount,
        m.dirCount,
        m.createdAt ?? '',
        m.modifiedAt ?? '',
        m.newestFileAt ?? '',
        row.item.scannedAt,
        d ? d.bytes : '',
        idle ?? ''
      ]
        .map(csvCell)
        .join(',')
    )
  }
  return lines.join('\r\n') + '\r\n'
}

/** The report text for the given rows, in the order they are shown. */
export function buildReport(format: ReportFormat, rows: LedgerRow[], now: Date = new Date()): string {
  return format === 'md' ? buildMarkdown(rows, now) : buildCsv(rows, now)
}

export function reportFileName(format: ReportFormat, now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `dirvo-report-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.${format}`
}
