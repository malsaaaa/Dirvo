import type { ScannedFolder } from '@shared/types'

/** Windows paths compare without regard to case, slash direction or a trailing slash. */
export function normPath(path: string): string {
  return path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

export interface ForestNode {
  item: ScannedFolder
  children: ForestNode[]
}

export type FolderComparator = (a: ScannedFolder, b: ScannedFolder) => number

const bySizeDesc: FolderComparator = (a, b) => b.metadata.sizeBytes - a.metadata.sizeBytes

/**
 * Groups results by containment. A folder that sits inside another result becomes that result's
 * child (under its closest listed parent). Roots and every child list are sorted by size, biggest first.
 */
export function buildForest(items: ScannedFolder[], compare: FolderComparator = bySizeDesc): ForestNode[] {
  const nodes = items.map((item): ForestNode => ({ item, children: [] }))
  const paths = items.map((i) => normPath(i.metadata.path))
  const roots: ForestNode[] = []

  nodes.forEach((node, i) => {
    let parent = -1
    for (let j = 0; j < nodes.length; j++) {
      if (j === i || !paths[i].startsWith(paths[j] + '\\')) continue
      // The closest parent is the longest path that contains this one.
      if (parent === -1 || paths[j].length > paths[parent].length) parent = j
    }
    if (parent === -1) roots.push(node)
    else nodes[parent].children.push(node)
  })

  const sortDeep = (list: ForestNode[]): void => {
    list.sort((a, b) => compare(a.item, b.item))
    list.forEach((n) => sortDeep(n.children))
  }
  sortDeep(roots)
  return roots
}

export interface LedgerRow {
  item: ScannedFolder
  /** 0 for a top-level result, 1 for a folder inside it, and so on. */
  depth: number
}

/** The ledger order: each top-level result, then the folders inside it, sorted the same way at every level. */
export function flattenLedger(items: ScannedFolder[], compare: FolderComparator = bySizeDesc): LedgerRow[] {
  const rows: LedgerRow[] = []
  const walk = (list: ForestNode[], depth: number): void => {
    for (const n of list) {
      rows.push({ item: n.item, depth })
      walk(n.children, depth + 1)
    }
  }
  walk(buildForest(items, compare), 0)
  return rows
}
