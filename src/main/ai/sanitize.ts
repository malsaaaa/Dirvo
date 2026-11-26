import type { FolderMetadata } from '../../shared/types'

export const USER_PLACEHOLDER = '<USER>'

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Replaces the Windows username with <USER>.
 *  1. Any "X:\Users\<name>" path segment, whatever the name is (covers other profiles too).
 *  2. Any standalone occurrence of the current username(s), e.g. in a file name.
 */
export function redactUser(text: string, usernames: string[] = []): string {
  let out = text.replace(/([a-z]:[\\/]+users[\\/]+)[^\\/]+/gi, `$1${USER_PLACEHOLDER}`)
  const names = [...new Set(usernames.map((u) => u.trim()).filter((u) => u.length > 0))].sort((a, b) => b.length - a.length)
  for (const name of names) {
    const re = new RegExp(`(?<![A-Za-z0-9])${escapeRegex(name)}(?![A-Za-z0-9])`, 'gi')
    out = out.replace(re, USER_PLACEHOLDER)
  }
  return out
}

/** Exactly what is sent to the AI. Nothing else leaves the PC. */
export interface AiPayload {
  path: string
  folderName: string
  sizeBytes: number
  fileCount: number
  subfolderCount: number
  extensionCounts: Record<string, number>
  createdAt: string | null
  modifiedAt: string | null
  oldestFileAt: string | null
  newestFileAt: string | null
  sampleFileNames: string[]
}

export function buildPayload(meta: FolderMetadata, usernames: string[]): AiPayload {
  const r = (s: string): string => redactUser(s, usernames)
  return {
    path: r(meta.path),
    folderName: r(meta.name),
    sizeBytes: meta.sizeBytes,
    fileCount: meta.fileCount,
    subfolderCount: meta.dirCount,
    extensionCounts: Object.fromEntries(Object.entries(meta.extensionCounts).map(([k, v]) => [r(k), v])),
    createdAt: meta.createdAt,
    modifiedAt: meta.modifiedAt,
    oldestFileAt: meta.oldestFileAt,
    newestFileAt: meta.newestFileAt,
    sampleFileNames: meta.sampleFileNames.map(r)
  }
}
