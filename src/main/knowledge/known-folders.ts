import type { Confidence, Verdict } from '../../shared/types'
import {
  compilePattern,
  matchesAncestor,
  matchesPath,
  specificity,
  splitPath,
  type CompiledPattern
} from './path-pattern'

export interface KnownFolderEntry {
  id: string
  patterns: string[]
  /** Also match anything inside a folder that matches (e.g. everything inside node_modules). */
  includeDescendants?: boolean
  whatItIs: string
  createdBy: string
  verdict: Verdict
  /** Defaults to HIGH. Use MEDIUM when the same folder name can mean different things. */
  confidence?: Confidence
  consequenceIfDeleted: string
}

const VERDICTS: Verdict[] = ['SAFE', 'REBUILDS_AUTOMATICALLY', 'CAUTION', 'DONT_TOUCH']
const CONFIDENCES: Confidence[] = ['LOW', 'MEDIUM', 'HIGH']

/** Checks the raw JSON and returns typed entries. Throws a readable error on any problem. */
export function validateDatabase(raw: unknown): KnownFolderEntry[] {
  if (!Array.isArray(raw)) throw new Error('known-folders: expected an array')
  const ids = new Set<string>()

  return raw.map((item, i) => {
    const where = `known-folders[${i}]`
    if (typeof item !== 'object' || item === null) throw new Error(`${where}: not an object`)
    const e = item as Record<string, unknown>

    const text = (key: string): string => {
      const v = e[key]
      if (typeof v !== 'string' || v.trim() === '') throw new Error(`${where}: "${key}" must be a non-empty string`)
      return v
    }
    const id = text('id')
    if (ids.has(id)) throw new Error(`${where}: duplicate id "${id}"`)
    ids.add(id)

    if (!Array.isArray(e.patterns) || e.patterns.length === 0) throw new Error(`${where} (${id}): needs patterns`)
    for (const p of e.patterns) {
      if (typeof p !== 'string') throw new Error(`${where} (${id}): pattern must be a string`)
      const compiled = compilePattern(p) // throws on malformed patterns
      const last = p.split('/').filter(Boolean).pop() ?? ''
      // A bare trailing wildcard is only OK when the pattern is pinned to a location (~ or <drive>)
      if (compiled.anchor === null && /^\*+$/.test(last)) {
        throw new Error(`${where} (${id}): pattern "${p}" must not end in a bare wildcard`)
      }
      if (compiled.anchor === null && compiled.segmentCount === 1 && last.length < 3) {
        throw new Error(`${where} (${id}): pattern "${p}" is too short and would match too much`)
      }
    }

    const verdict = text('verdict')
    if (!VERDICTS.includes(verdict as Verdict)) throw new Error(`${where} (${id}): bad verdict "${verdict}"`)
    if (e.confidence !== undefined && !CONFIDENCES.includes(e.confidence as Confidence)) {
      throw new Error(`${where} (${id}): bad confidence`)
    }
    if (e.includeDescendants !== undefined && typeof e.includeDescendants !== 'boolean') {
      throw new Error(`${where} (${id}): includeDescendants must be a boolean`)
    }

    return {
      id,
      patterns: e.patterns as string[],
      includeDescendants: e.includeDescendants === true,
      whatItIs: text('whatItIs'),
      createdBy: text('createdBy'),
      verdict: verdict as Verdict,
      confidence: (e.confidence as Confidence | undefined) ?? 'HIGH',
      consequenceIfDeleted: text('consequenceIfDeleted')
    }
  })
}

export interface MatchResult {
  entry: KnownFolderEntry
  /** The pattern that matched. */
  pattern: CompiledPattern
  /** "exact": the path is the described folder. "inside": the path lives within it. */
  kind: 'exact' | 'inside'
}

export interface Matcher {
  match: (path: string) => MatchResult | null
}

export function createMatcher(entries: KnownFolderEntry[]): Matcher {
  const compiled = entries.flatMap((entry) =>
    entry.patterns.map((p) => ({ entry, pattern: compilePattern(p) }))
  )

  return {
    match(path) {
      const segments = splitPath(path)
      if (segments.length === 0) return null

      let best: MatchResult | null = null
      for (const { entry, pattern } of compiled) {
        if (matchesPath(pattern, segments) && (!best || specificity(pattern) > specificity(best.pattern))) {
          best = { entry, pattern, kind: 'exact' }
        }
      }
      if (best) return best

      for (const { entry, pattern } of compiled) {
        if (!entry.includeDescendants) continue
        if (matchesAncestor(pattern, segments) && (!best || specificity(pattern) > specificity(best.pattern))) {
          best = { entry, pattern, kind: 'inside' }
        }
      }
      return best
    }
  }
}
