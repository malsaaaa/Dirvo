import type { ReportFormat, ReportRequest } from '../../shared/types'
import { redactUser } from '../ai/sanitize'

export const MAX_REPORT_BYTES = 20 * 1024 * 1024
const FORMATS: ReportFormat[] = ['md', 'csv']

/** Excel needs a byte order mark to read UTF-8 CSV correctly (without it, "×" and "…" come out garbled). */
const BOM = '﻿'

export class ReportRequestError extends Error {}

/** Checks what the window asked for. Only the shape and size matter: the user still picks where it goes. */
export function validateReportRequest(raw: unknown): ReportRequest {
  if (typeof raw !== 'object' || raw === null) throw new ReportRequestError('Invalid report')
  const r = raw as Record<string, unknown>
  if (typeof r.content !== 'string' || r.content.length === 0) throw new ReportRequestError('The report is empty')
  if (Buffer.byteLength(r.content, 'utf8') > MAX_REPORT_BYTES) throw new ReportRequestError('The report is too large to save')
  if (typeof r.format !== 'string' || !FORMATS.includes(r.format as ReportFormat)) throw new ReportRequestError('Unknown report format')
  return {
    content: r.content,
    format: r.format as ReportFormat,
    suggestedName: typeof r.suggestedName === 'string' ? r.suggestedName : '',
    redactUser: r.redactUser === true
  }
}

/**
 * A file name that is safe to offer in the save dialog: no folders, none of the characters Windows
 * rejects, no reserved device names, never empty, and always with the right extension.
 */
export function safeFileName(name: string, format: ReportFormat): string {
  const ext = `.${format}`
  let base = name
    .replace(/[\\/]/g, ' ')
    .replace(/[<>:"|?*\u0000-\u001f]/g, '')
    .trim()
    .replace(/[. ]+$/, '')
  if (base.toLowerCase().endsWith(ext)) base = base.slice(0, -ext.length).replace(/[. ]+$/, '')
  if (base === '' || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base)) base = 'dirvo-report'
  return `${base.slice(0, 100)}${ext}`
}

/** Makes sure the path the user typed ends with the format's extension. */
export function withExtension(path: string, format: ReportFormat): string {
  const ext = `.${format}`
  return path.toLowerCase().endsWith(ext) ? path : `${path}${ext}`
}

/** The exact text written to disk: the username hidden if asked, and a byte order mark for CSV. */
export function prepareContent(req: ReportRequest, usernames: string[]): string {
  const text = req.redactUser ? redactUser(req.content, usernames) : req.content
  return req.format === 'csv' ? BOM + text : text
}
