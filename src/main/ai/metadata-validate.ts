import type { FolderMetadata } from '../../shared/types'

const MAX_TEXT = 1024
const MAX_NAME = 300
const MAX_SAMPLES = 30
const MAX_EXTENSIONS = 50

/**
 * The renderer hands us metadata to send to the AI. Check its shape and size first, so the only
 * thing that can leave the PC is the small, well-formed record the scanner produces.
 */
export function validateMetadata(raw: unknown): FolderMetadata {
  if (typeof raw !== 'object' || raw === null) throw new Error('Invalid folder data')
  const m = raw as Record<string, unknown>

  const str = (key: string, max: number): string => {
    const v = m[key]
    if (typeof v !== 'string' || v.length === 0 || v.length > max) throw new Error(`Invalid folder data: ${key}`)
    return v
  }
  const num = (key: string): number => {
    const v = m[key]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error(`Invalid folder data: ${key}`)
    return v
  }
  const date = (key: string): string | null => {
    const v = m[key]
    if (v === null) return null
    if (typeof v !== 'string' || v.length > 40 || Number.isNaN(Date.parse(v))) throw new Error(`Invalid folder data: ${key}`)
    return v
  }

  const samples = m.sampleFileNames
  if (!Array.isArray(samples) || samples.length > MAX_SAMPLES || samples.some((s) => typeof s !== 'string' || s.length > MAX_NAME)) {
    throw new Error('Invalid folder data: sampleFileNames')
  }

  const ext = m.extensionCounts
  if (typeof ext !== 'object' || ext === null || Array.isArray(ext)) throw new Error('Invalid folder data: extensionCounts')
  const extEntries = Object.entries(ext as Record<string, unknown>)
  if (extEntries.length > MAX_EXTENSIONS) throw new Error('Invalid folder data: extensionCounts')
  for (const [k, v] of extEntries) {
    if (k.length > 40 || typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      throw new Error('Invalid folder data: extensionCounts')
    }
  }

  return {
    path: str('path', MAX_TEXT),
    name: str('name', MAX_NAME),
    sizeBytes: num('sizeBytes'),
    fileCount: num('fileCount'),
    dirCount: num('dirCount'),
    extensionCounts: Object.fromEntries(extEntries) as Record<string, number>,
    createdAt: date('createdAt'),
    modifiedAt: date('modifiedAt'),
    oldestFileAt: date('oldestFileAt'),
    newestFileAt: date('newestFileAt'),
    sampleFileNames: samples as string[],
    unreadableCount: 0,
    linksSkipped: 0
  }
}
