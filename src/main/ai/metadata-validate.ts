import type { FolderMetadata, LargeFile } from '../../shared/types'

const MAX_TEXT = 1024
const MAX_NAME = 300
const MAX_SAMPLES = 30
const MAX_EXTENSIONS = 50
const MAX_LARGEST = 5

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

  const kind = m.kind
  if (kind !== undefined && kind !== 'folder' && kind !== 'file') throw new Error('Invalid folder data: kind')

  // Only kept when well formed. It is never sent to the AI (the payload is built field by field).
  let largestFiles: LargeFile[] | undefined
  if (m.largestFiles !== undefined) {
    const lf = m.largestFiles
    if (!Array.isArray(lf) || lf.length > MAX_LARGEST) throw new Error('Invalid folder data: largestFiles')
    largestFiles = lf.map((f): LargeFile => {
      const o = typeof f === 'object' && f !== null ? (f as Record<string, unknown>) : {}
      if (typeof o.path !== 'string' || o.path.length === 0 || o.path.length > MAX_TEXT) throw new Error('Invalid folder data: largestFiles')
      if (typeof o.sizeBytes !== 'number' || !Number.isFinite(o.sizeBytes) || o.sizeBytes < 0) throw new Error('Invalid folder data: largestFiles')
      const at = o.modifiedAt
      if (at !== null && (typeof at !== 'string' || at.length > 40 || Number.isNaN(Date.parse(at)))) throw new Error('Invalid folder data: largestFiles')
      return { path: o.path, sizeBytes: o.sizeBytes, modifiedAt: at }
    })
  }

  return {
    ...(kind === 'file' ? { kind: 'file' as const } : {}),
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
    linksSkipped: 0,
    ...(largestFiles && largestFiles.length > 0 ? { largestFiles } : {})
  }
}
