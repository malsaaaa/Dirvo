import type { FolderExplanation } from '../../shared/types'
import { compilePattern, matchesAncestor, matchesPath, splitPath, type CompiledPattern } from './path-pattern'

/**
 * Hard rules. These are checked BEFORE the database and the AI, and their answer is always
 * DONT_TOUCH. Nothing (including a low-confidence AI answer) can lower them.
 */

interface SystemRule {
  id: string
  patterns: string[]
  whatItIs: string
  createdBy: string
  consequenceIfDeleted: string
}

// Folders that are protected exactly. Their contents may still be matched by the database
// (for example Temp inside AppData), but these folders themselves must never be deleted.
const EXACT_RULES: SystemRule[] = [
  {
    id: 'sys-drive-root',
    patterns: ['<drive>'],
    whatItIs: 'The root of a drive. Everything on the drive lives below it.',
    createdBy: 'Windows',
    consequenceIfDeleted: 'Deleting it would erase the whole drive and can make Windows unbootable.'
  },
  {
    id: 'sys-windows',
    patterns: ['<drive>/Windows'],
    whatItIs: 'The Windows operating system folder.',
    createdBy: 'Windows',
    consequenceIfDeleted: 'Windows stops working and will not boot.'
  },
  {
    id: 'sys-program-files',
    patterns: ['<drive>/Program Files', '<drive>/Program Files (x86)'],
    whatItIs: 'The folder where installed programs live.',
    createdBy: 'Windows',
    consequenceIfDeleted: 'Every installed program breaks. To remove a program, uninstall it from Settings.'
  },
  {
    id: 'sys-programdata',
    patterns: ['<drive>/ProgramData'],
    whatItIs: 'Shared settings and data used by installed programs and Windows.',
    createdBy: 'Windows',
    consequenceIfDeleted: 'Programs and Windows features lose their settings and may stop working.'
  },
  {
    id: 'sys-users',
    patterns: ['<drive>/Users'],
    whatItIs: 'The folder that holds every user account profile on this PC.',
    createdBy: 'Windows',
    consequenceIfDeleted: 'All user accounts lose their files and settings. You may be unable to sign in.'
  },
  {
    id: 'sys-profile-root',
    patterns: ['~'],
    whatItIs: 'A user profile folder: it holds that person\'s documents, desktop, downloads and app settings.',
    createdBy: 'Windows',
    consequenceIfDeleted: 'You lose that user\'s personal files and settings, and may be unable to sign in as them.'
  },
  {
    id: 'sys-user-data-folders',
    patterns: [
      '~/Documents',
      '~/Desktop',
      '~/Downloads',
      '~/Pictures',
      '~/Music',
      '~/Videos',
      '~/OneDrive*',
      '~/OneDrive*/Documents',
      '~/OneDrive*/Desktop',
      '~/OneDrive*/Pictures'
    ],
    whatItIs: 'One of your personal folders (documents, desktop, downloads, pictures, music, videos or OneDrive).',
    createdBy: 'Windows',
    consequenceIfDeleted: 'You permanently lose your own files. If OneDrive syncs this folder, the deletion also spreads to the cloud.'
  },
  {
    id: 'sys-appdata-roots',
    patterns: ['~/AppData', '~/AppData/Local', '~/AppData/Roaming', '~/AppData/LocalLow'],
    whatItIs: 'The folder where programs keep their settings, caches and saved data for your account.',
    createdBy: 'Windows',
    consequenceIfDeleted: 'Almost every program loses its settings and data, and some stop working.'
  }
]

// Whole trees that belong to the system. Anything inside is DONT_TOUCH unless a known-folder
// entry written for system paths (anchored to the drive) says more.
const TREE_RULES: SystemRule[] = [
  {
    id: 'sys-windows-tree',
    patterns: ['<drive>/Windows'],
    whatItIs: 'Part of the Windows operating system.',
    createdBy: 'Windows',
    consequenceIfDeleted: 'Windows or its updates and drivers can break, and it may stop booting.'
  },
  {
    id: 'sys-program-files-tree',
    patterns: ['<drive>/Program Files', '<drive>/Program Files (x86)'],
    whatItIs: 'Part of an installed program.',
    createdBy: 'The program\'s installer',
    consequenceIfDeleted: 'That program may stop working. To remove it, uninstall it from Settings instead.'
  }
]

interface CompiledRule {
  rule: SystemRule
  patterns: CompiledPattern[]
}

const compile = (rules: SystemRule[]): CompiledRule[] =>
  rules.map((rule) => ({ rule, patterns: rule.patterns.map(compilePattern) }))

const exactRules = compile(EXACT_RULES)
const treeRules = compile(TREE_RULES)

const explain = (rule: SystemRule): FolderExplanation => ({
  whatItIs: rule.whatItIs,
  createdBy: rule.createdBy,
  verdict: 'DONT_TOUCH',
  confidence: 'HIGH',
  consequenceIfDeleted: rule.consequenceIfDeleted,
  source: 'system',
  matchedId: rule.id
})

/** The path IS a protected folder. */
export function matchProtectedFolder(path: string): FolderExplanation | null {
  const segments = splitPath(path)
  for (const { rule, patterns } of exactRules) {
    if (patterns.some((p) => matchesPath(p, segments))) return explain(rule)
  }
  return null
}

// Protected folders that mostly just hold other folders. A drive scan looks inside them instead of
// reporting them as one big lump.
const CONTAINER_IDS = new Set([
  'sys-drive-root',
  'sys-windows',
  'sys-program-files',
  'sys-programdata',
  'sys-users',
  'sys-profile-root',
  'sys-appdata-roots'
])

export function isContainerFolder(path: string): boolean {
  const id = matchProtectedFolder(path)?.matchedId
  return id !== undefined && CONTAINER_IDS.has(id)
}

/** The path is inside a protected system tree (Windows, Program Files). */
export function matchProtectedTree(path: string): FolderExplanation | null {
  const segments = splitPath(path)
  for (const { rule, patterns } of treeRules) {
    if (patterns.some((p) => matchesPath(p, segments) || matchesAncestor(p, segments))) return explain(rule)
  }
  return null
}
