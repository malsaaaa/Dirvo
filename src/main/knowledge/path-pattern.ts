/**
 * Tiny path-pattern engine for Windows paths.
 *
 * Patterns use "/" and are case-insensitive. Segments may contain "*" (any characters
 * within one segment). Two anchors exist:
 *   "<drive>/Windows/Temp"   path must be exactly C:\Windows\Temp (any drive letter)
 *   "~/AppData/Local/Temp"   path must be exactly C:\Users\<anyone>\AppData\Local\Temp
 * A pattern with no anchor matches the END of a path: "node_modules" matches
 * C:\anything\node_modules, ".gradle/caches" matches C:\x\.gradle\caches.
 */

export type Anchor = 'drive' | 'home' | null

export interface CompiledPattern {
  raw: string
  anchor: Anchor
  segmentCount: number
  /** Number of non-wildcard characters. Used to break ties between equally long patterns. */
  literalChars: number
  matchers: Array<(segment: string) => boolean>
}

const DRIVE = /^[a-z]:$/

export function splitPath(path: string): string[] {
  return path
    .replace(/^\\\\\?\\/, '') // \\?\C:\... long-path prefix
    .replace(/\\/g, '/')
    .toLowerCase()
    .split('/')
    .filter((s) => s.length > 0)
}

export function compilePattern(raw: string): CompiledPattern {
  const parts = raw.toLowerCase().split('/').filter((s) => s.length > 0)
  if (parts.length === 0) throw new Error(`Empty pattern: "${raw}"`)

  let anchor: Anchor = null
  let segs = parts
  if (parts[0] === '~') {
    anchor = 'home'
    segs = ['<drive>', 'users', '*', ...parts.slice(1)]
  } else if (parts[0] === '<drive>') {
    anchor = 'drive'
  }
  if (segs.some((s, i) => s === '<drive>' && i > 0)) throw new Error(`"<drive>" must be first: "${raw}"`)

  let literalChars = 0
  const matchers = segs.map((seg) => {
    if (seg === '<drive>') return (s: string) => DRIVE.test(s)
    if (seg.includes('*')) {
      literalChars += seg.replace(/\*/g, '').length
      const re = new RegExp('^' + seg.split('*').map(escapeRegex).join('.*') + '$')
      return (s: string) => re.test(s)
    }
    literalChars += seg.length
    return (s: string) => s === seg
  })

  return { raw, anchor, segmentCount: segs.length, literalChars, matchers }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchesAt(p: CompiledPattern, segments: string[], start: number): boolean {
  return p.matchers.every((m, i) => m(segments[start + i]))
}

/** The pattern describes exactly this path (anchored) or the end of it (unanchored). */
export function matchesPath(p: CompiledPattern, segments: string[]): boolean {
  const start = segments.length - p.segmentCount
  if (start < 0) return false
  if (p.anchor && start !== 0) return false
  return matchesAt(p, segments, start)
}

/** The pattern describes a proper ancestor of this path, so the path lives inside it. */
export function matchesAncestor(p: CompiledPattern, segments: string[]): boolean {
  const lastStart = segments.length - 1 - p.segmentCount
  if (lastStart < 0) return false
  if (p.anchor) return matchesAt(p, segments, 0)
  for (let start = lastStart; start >= 0; start--) {
    if (matchesAt(p, segments, start)) return true
  }
  return false
}

/** Higher is more specific. */
export function specificity(p: CompiledPattern): number {
  return p.segmentCount * 1000 + p.literalChars
}
