import { promises as fsp } from 'node:fs'
import { dirname } from 'node:path'
import type { Confidence, FolderExplanation, ScannedFolder, SavedScans, SizeSnapshot, Verdict } from '../../shared/types'
import { validateMetadata } from '../ai/metadata-validate'

export const MAX_SAVED_ITEMS = 2000
export const MAX_HISTORY_ENTRIES = 5000
const MAX_TEXT = 600

const VERDICTS: Verdict[] = ['SAFE', 'REBUILDS_AUTOMATICALLY', 'CAUTION', 'DONT_TOUCH']
const CONFIDENCES: Confidence[] = ['LOW', 'MEDIUM', 'HIGH']

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const isDate = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v))

function snapshot(raw: unknown): SizeSnapshot | null {
  if (!isObj(raw) || !isCount(raw.sizeBytes) || !isDate(raw.scannedAt)) return null
  return { sizeBytes: raw.sizeBytes, scannedAt: raw.scannedAt }
}

/** Only AI answers are saved and read back; everything else is recomputed, so this is deliberately narrow. */
function aiExplanation(raw: unknown): FolderExplanation | null {
  if (!isObj(raw) || raw.source !== 'ai') return null
  const text = (k: string): string | null => (typeof raw[k] === 'string' && raw[k].trim() !== '' ? (raw[k] as string).trim().slice(0, MAX_TEXT) : null)
  const whatItIs = text('whatItIs')
  const createdBy = text('createdBy')
  const consequenceIfDeleted = text('consequenceIfDeleted')
  if (!whatItIs || !createdBy || !consequenceIfDeleted) return null
  if (!VERDICTS.includes(raw.verdict as Verdict) || !CONFIDENCES.includes(raw.confidence as Confidence)) return null
  const out: FolderExplanation = {
    whatItIs,
    createdBy,
    consequenceIfDeleted,
    verdict: raw.verdict as Verdict,
    confidence: raw.confidence as Confidence,
    source: 'ai'
  }
  if (VERDICTS.includes(raw.downgradedFrom as Verdict)) out.downgradedFrom = raw.downgradedFrom as Verdict
  if (raw.downgradeReason === 'low-confidence' || raw.downgradeReason === 'contradiction') out.downgradeReason = raw.downgradeReason
  return out
}

/**
 * Checks saved data and rebuilds each result. The file is on disk where anything could change it, so
 * every field is validated and capped. Rulings from the database and system rules are NOT trusted from
 * the file: they are recomputed with `explain`, so an updated database improves old results.
 */
export function validateSavedScans(raw: unknown, explain: (path: string) => FolderExplanation | null): SavedScans {
  const out: SavedScans = { items: [], history: {} }
  if (!isObj(raw)) return out

  if (Array.isArray(raw.items)) {
    const seen = new Set<string>()
    for (const entry of raw.items.slice(0, MAX_SAVED_ITEMS)) {
      if (!isObj(entry) || !isDate(entry.scannedAt)) continue
      let metadata: ReturnType<typeof validateMetadata>
      try {
        metadata = validateMetadata(entry.metadata)
      } catch {
        continue
      }
      // validateMetadata is made for the AI request, which does not carry these two counts.
      const m = entry.metadata as Record<string, unknown>
      metadata.unreadableCount = isCount(m.unreadableCount) ? m.unreadableCount : 0
      metadata.linksSkipped = isCount(m.linksSkipped) ? m.linksSkipped : 0

      const key = metadata.path.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)

      const item: ScannedFolder = {
        metadata,
        explanation: explain(metadata.path) ?? aiExplanation(entry.explanation),
        aiStatus: 'none',
        scannedAt: entry.scannedAt
      }
      const previous = snapshot(entry.previous)
      if (previous) item.previous = previous
      const li = entry.lookedInside
      if (isObj(li) && isCount(li.listed) && isCount(li.hiddenSmall) && isCount(li.skipped)) {
        item.lookedInside = { listed: li.listed, hiddenSmall: li.hiddenSmall, skipped: li.skipped }
      }
      out.items.push(item)
    }
  }

  if (isObj(raw.history)) {
    for (const [path, snap] of Object.entries(raw.history).slice(0, MAX_HISTORY_ENTRIES)) {
      const s = snapshot(snap)
      if (s && path.length > 0 && path.length <= 1024) out.history[path] = s
    }
  }
  return out
}

/** The version written to disk: AI answers only. Database rulings are recomputed on load. */
function forDisk(saved: SavedScans): unknown {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    items: saved.items.map((i) => ({
      metadata: i.metadata,
      explanation: i.explanation?.source === 'ai' ? i.explanation : null,
      scannedAt: i.scannedAt,
      previous: i.previous,
      lookedInside: i.lookedInside
    })),
    history: saved.history
  }
}

/** Results and size history, kept in one JSON file on this PC. Nothing is uploaded. */
export class SavedScansStore {
  private writing: Promise<void> = Promise.resolve()

  constructor(
    private readonly filePath: string,
    private readonly explain: (path: string) => FolderExplanation | null
  ) {}

  async load(): Promise<SavedScans> {
    try {
      return validateSavedScans(JSON.parse(await fsp.readFile(this.filePath, 'utf8')), this.explain)
    } catch {
      return { items: [], history: {} } // missing or corrupt: start empty
    }
  }

  /** Writes one save at a time, to a temp file first, so a crash cannot leave a half-written file. */
  save(raw: unknown): Promise<void> {
    // Validating also recomputes the offline rulings; only AI answers (which cannot be recomputed) are written.
    const json = JSON.stringify(forDisk(validateSavedScans(raw, this.explain)))
    this.writing = this.writing.then(async () => {
      await fsp.mkdir(dirname(this.filePath), { recursive: true })
      const tmp = `${this.filePath}.tmp`
      await fsp.writeFile(tmp, json)
      await fsp.rename(tmp, this.filePath)
    })
    return this.writing
  }

  /** Resolves when every save so far has been written. */
  idle(): Promise<void> {
    return this.writing.catch(() => undefined)
  }

  async clear(): Promise<void> {
    await this.writing.catch(() => undefined)
    await fsp.rm(this.filePath, { force: true })
  }
}
