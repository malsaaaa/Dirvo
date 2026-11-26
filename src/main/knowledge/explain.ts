import type { FolderExplanation } from '../../shared/types'
import knownFoldersJson from '../../../data/known-folders.json'
import { createMatcher, validateDatabase, type Matcher } from './known-folders'
import { matchProtectedFolder, matchProtectedTree } from './system-paths'

let defaultMatcher: Matcher | undefined

/** Validated once, on first use. A broken database fails loudly here instead of giving bad advice. */
function getDefaultMatcher(): Matcher {
  defaultMatcher ??= createMatcher(validateDatabase(knownFoldersJson))
  return defaultMatcher
}

/**
 * Offline answer for a folder path, or null when it is unknown (the AI fallback handles those).
 * Order matters:
 *   1. Protected folders (Windows, Program Files, profile root, Documents, Desktop, ...) -> DONT_TOUCH
 *   2. Known-folder database
 *   3. Anything else inside the Windows / Program Files trees -> DONT_TOUCH
 * Inside those trees only database entries anchored to the drive (written for system paths,
 * like Windows/Temp) may match, so a generic entry such as "node_modules" cannot green-light
 * something under C:\Windows.
 */
export function explainPath(path: string, matcher: Matcher = getDefaultMatcher()): FolderExplanation | null {
  const protectedFolder = matchProtectedFolder(path)
  if (protectedFolder) return protectedFolder

  const inSystemTree = matchProtectedTree(path)
  const hit = matcher.match(path)
  if (hit && (!inSystemTree || hit.pattern.anchor === 'drive')) {
    const { entry, kind } = hit
    return {
      whatItIs: entry.whatItIs,
      createdBy: entry.createdBy,
      verdict: entry.verdict,
      confidence: entry.confidence ?? 'HIGH',
      consequenceIfDeleted: entry.consequenceIfDeleted,
      source: 'database',
      matchedId: kind === 'inside' ? `${entry.id} (inside)` : entry.id
    }
  }

  return inSystemTree
}
