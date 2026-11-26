import type { ScannedFolder } from '@shared/types'
import { IDLE_YEAR_DAYS, isIdle } from './age'
import { flattenLedger, type FolderComparator, type LedgerRow } from './tree'

export type SortKey = 'size-desc' | 'size-asc' | 'name' | 'untouched' | 'recent'
export type FilterKey = 'ALL' | 'RECLAIMABLE' | 'CAUTION' | 'DONT_TOUCH' | 'UNKNOWN'

export interface LedgerView {
  query: string
  filter: FilterKey
  sort: SortKey
  /** Only folders nothing has touched for a year or more. Works together with the other filters. */
  idleOnly: boolean
}

export const DEFAULT_VIEW: LedgerView = { query: '', filter: 'ALL', sort: 'size-desc', idleOnly: false }

export const SORT_LABELS: Record<SortKey, string> = {
  'size-desc': 'Largest first',
  'size-asc': 'Smallest first',
  name: 'Name, A to Z',
  untouched: 'Untouched longest',
  recent: 'Changed most recently'
}

export const FILTER_LABELS: Record<FilterKey, string> = {
  ALL: 'All',
  RECLAIMABLE: 'Reclaimable',
  CAUTION: 'Careful',
  DONT_TOUCH: "Don't touch",
  UNKNOWN: 'Unknown'
}

export const FILTER_ORDER: FilterKey[] = ['ALL', 'RECLAIMABLE', 'CAUTION', 'DONT_TOUCH', 'UNKNOWN']

/** Which filter chip a folder belongs to. "Reclaimable" is Safe plus Rebuilds, the folders worth cleaning first. */
export function filterOf(item: ScannedFolder): Exclude<FilterKey, 'ALL'> {
  switch (item.explanation?.verdict) {
    case 'SAFE':
    case 'REBUILDS_AUTOMATICALLY':
      return 'RECLAIMABLE'
    case 'CAUTION':
      return 'CAUTION'
    case 'DONT_TOUCH':
      return 'DONT_TOUCH'
    default:
      return 'UNKNOWN'
  }
}

/** Every word typed must appear in the folder's name, its path, or who made it (any case). */
export function matchesQuery(item: ScannedFolder, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const haystack = `${item.metadata.name} ${item.metadata.path} ${item.explanation?.createdBy ?? ''}`.toLowerCase()
  return terms.every((t) => haystack.includes(t))
}

/** The date a folder was last active: its newest file, or the folder's own date if it is empty. */
function activity(item: ScannedFolder): number | null {
  const iso = item.metadata.newestFileAt ?? item.metadata.modifiedAt
  const t = iso ? Date.parse(iso) : NaN
  return Number.isNaN(t) ? null : t
}

/** Folders with no known date always go last, whichever way the dates are ordered. */
function byDate(direction: 1 | -1): FolderComparator {
  return (a, b) => {
    const x = activity(a)
    const y = activity(b)
    if (x === null && y === null) return 0
    if (x === null) return 1
    if (y === null) return -1
    return (x - y) * direction
  }
}

export function compareFor(sort: SortKey): FolderComparator {
  const size = (a: ScannedFolder, b: ScannedFolder): number => b.metadata.sizeBytes - a.metadata.sizeBytes
  switch (sort) {
    case 'size-desc':
      return size
    case 'size-asc':
      return (a, b) => -size(a, b)
    case 'name':
      return (a, b) => a.metadata.name.localeCompare(b.metadata.name, undefined, { sensitivity: 'base', numeric: true })
    case 'untouched':
      return byDate(1)
    case 'recent':
      return byDate(-1)
  }
}

export interface ViewResult {
  rows: LedgerRow[]
  /** Folders shown. */
  matched: number
  total: number
  /** How many folders each chip would show with the current search. */
  counts: Record<FilterKey, number>
  /** How many of the searched folders have been idle for a year or more (what the Idle chip would show). */
  idleCount: number
  /** A search or filter is on. The list is then flat; otherwise it is the indented tree. */
  filtering: boolean
}

/**
 * Applies the search, filter and sort. With no search or filter the ledger keeps its tree (folders
 * under their parent). Once you search or filter, matches are shown as a flat list, because an
 * indented tree with rows missing would be confusing; each row's path still shows where it lives.
 */
export function applyView(items: ScannedFolder[], view: LedgerView, now: number = Date.now()): ViewResult {
  const compare = compareFor(view.sort)
  const searched = items.filter((i) => matchesQuery(i, view.query))

  const counts: Record<FilterKey, number> = { ALL: searched.length, RECLAIMABLE: 0, CAUTION: 0, DONT_TOUCH: 0, UNKNOWN: 0 }
  for (const i of searched) counts[filterOf(i)]++

  const idleCount = searched.filter((i) => isIdle(i, IDLE_YEAR_DAYS, now)).length

  const filtering = view.query.trim() !== '' || view.filter !== 'ALL' || view.idleOnly
  if (!filtering) {
    return { rows: flattenLedger(items, compare), matched: items.length, total: items.length, counts, idleCount, filtering }
  }

  const byRuling = view.filter === 'ALL' ? searched : searched.filter((i) => filterOf(i) === view.filter)
  const shown = (view.idleOnly ? byRuling.filter((i) => isIdle(i, IDLE_YEAR_DAYS, now)) : byRuling).sort(compare)
  return { rows: shown.map((item) => ({ item, depth: 0 })), matched: shown.length, total: items.length, counts, idleCount, filtering }
}
