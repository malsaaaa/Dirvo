import type { FolderExplanation } from '../../shared/types'
import knownFilesJson from '../../../data/known-files.json'
import { createMatcher, validateDatabase, type MatchResult, type Matcher } from './known-folders'
import { getDefaultMatcher } from './explain'
import { matchProtectedTree } from './system-paths'

let defaultFileMatcher: Matcher | undefined

/** Validated once, on first use, with the same rules as the folder database. */
function getFileMatcher(): Matcher {
  defaultFileMatcher ??= createMatcher(validateDatabase(knownFilesJson, 'known-files'))
  return defaultFileMatcher
}

/** "*.docx" style rules say what KIND of file this is. A file named in the database ("pagefile.sys") is more exact. */
function isTypeRule(hit: MatchResult): boolean {
  const last = hit.pattern.raw.split('/').filter(Boolean).pop() ?? ''
  return last.startsWith('*')
}

function fromEntry(hit: MatchResult, inside = false): FolderExplanation {
  const { entry } = hit
  return {
    whatItIs: entry.whatItIs,
    createdBy: entry.createdBy,
    verdict: entry.verdict,
    confidence: entry.confidence ?? 'HIGH',
    consequenceIfDeleted: entry.consequenceIfDeleted,
    source: 'database',
    ...(entry.howToClean ? { howToClean: entry.howToClean } : {}),
    matchedId: inside ? `${entry.id} (inside)` : entry.id
  }
}

/**
 * Offline answer for a file path, or null when it is unknown (the AI fallback handles those).
 * Order matters:
 *   1. A file the database knows by name (pagefile.sys, ntuser.dat, ...)
 *   2. A file inside a folder the folder database describes (everything in Temp, in node_modules, ...)
 *   3. The kind of file, from its extension (a .docx is a document, a .dll is a program part)
 *   4. Anything else inside the Windows / Program Files trees -> DONT_TOUCH
 * Inside those trees only entries anchored to the drive (written for system paths) may match, so a
 * generic "*.log" rule cannot green-light a file under C:\Windows.
 */
export function explainFilePath(
  path: string,
  fileMatcher: Matcher = getFileMatcher(),
  folderMatcher: Matcher = getDefaultMatcher()
): FolderExplanation | null {
  const inSystemTree = matchProtectedTree(path)
  const allowed = (hit: MatchResult): boolean => !inSystemTree || hit.pattern.anchor === 'drive'

  const fileHit = fileMatcher.match(path)
  if (fileHit && allowed(fileHit) && !isTypeRule(fileHit)) return fromEntry(fileHit)

  // The folder database matches folder names, so a FILE called "Temp" must not match; only "inside" counts.
  const folderHit = folderMatcher.match(path)
  if (folderHit && folderHit.kind === 'inside' && allowed(folderHit)) return fromEntry(folderHit, true)

  if (fileHit && allowed(fileHit)) return fromEntry(fileHit)

  return inSystemTree
}
