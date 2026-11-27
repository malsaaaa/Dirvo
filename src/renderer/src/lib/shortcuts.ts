export type Screen = 'pick' | 'drive' | 'results' | 'settings'

/** What a key press asks the app to do. */
export type ShortcutAction =
  | { type: 'move'; to: 'next' | 'prev' | 'first' | 'last' }
  | { type: 'search' }
  | { type: 'export' }
  | { type: 'help' }
  | { type: 'screen'; screen: Screen }
  | { type: 'row'; do: 'open' | 'copy' | 'rescan' | 'lookInside' | 'explainAi' }

/** The parts of a key event the logic looks at, so it can be tested without a browser. */
export interface KeyInput {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

export interface KeyContext {
  /** The focus is in a text box, a dropdown or similar: plain keys belong to it. */
  typing: boolean
  /** A dialog is open and handles its own keys. */
  modalOpen: boolean
  screen: Screen
}

const SCREEN_BY_DIGIT: Record<string, Screen> = { '1': 'pick', '2': 'drive', '3': 'results', '4': 'settings' }
const ROW_BY_KEY: Record<string, 'open' | 'copy' | 'rescan' | 'lookInside' | 'explainAi'> = {
  o: 'open',
  c: 'copy',
  r: 'rescan',
  i: 'lookInside',
  a: 'explainAi'
}

/**
 * Turns a key press into an action, or null when the key should be left alone. Plain letters are
 * ignored while typing, and combos with Ctrl, Alt or Cmd are ignored unless they are one of Dirvo's own,
 * so normal copy, paste and browser shortcuts keep working.
 */
export function keyToAction(e: KeyInput, ctx: KeyContext): ShortcutAction | null {
  if (ctx.modalOpen) return null
  const ctrl = (e.ctrlKey || e.metaKey) === true
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key

  // Dirvo's own Ctrl combos work from anywhere, even while typing.
  if (ctrl && !e.altKey) {
    if (SCREEN_BY_DIGIT[key]) return { type: 'screen', screen: SCREEN_BY_DIGIT[key] }
    if (key === 'f') return { type: 'search' }
    if (key === 'e') return { type: 'export' }
    return null
  }
  if (e.altKey) return null
  if (ctx.typing) return null

  if (e.key === '?') return { type: 'help' }
  if (e.key === '/' && !e.shiftKey) return { type: 'search' }

  // Everything else acts on the results list.
  if (ctx.screen !== 'results' || e.shiftKey) return null
  switch (key) {
    case 'j':
    case 'ArrowDown':
      return { type: 'move', to: 'next' }
    case 'k':
    case 'ArrowUp':
      return { type: 'move', to: 'prev' }
    case 'Home':
      return { type: 'move', to: 'first' }
    case 'End':
      return { type: 'move', to: 'last' }
  }
  const row = ROW_BY_KEY[key]
  return row ? { type: 'row', do: row } : null
}

/** The next selection after a move. `current` is the index of the selected row, or -1 if it is not in the list. */
export function movedIndex(current: number, count: number, to: 'next' | 'prev' | 'first' | 'last'): number {
  if (count <= 0) return -1
  if (to === 'first') return 0
  if (to === 'last') return count - 1
  if (current < 0) return 0
  return Math.max(0, Math.min(count - 1, current + (to === 'next' ? 1 : -1)))
}

export interface ShortcutDoc {
  /** Keys shown as keycaps. "or" separates alternatives. */
  keys: string[]
  label: string
  /** An example input that triggers it, used to check this list against the real logic. */
  example: KeyInput
  needsResults?: boolean
}

export const SHORTCUT_GROUPS: Array<{ title: string; items: ShortcutDoc[] }> = [
  {
    title: 'Move through the results',
    items: [
      { keys: ['j', 'or', '↓'], label: 'Next result', example: { key: 'j' }, needsResults: true },
      { keys: ['k', 'or', '↑'], label: 'Previous result', example: { key: 'k' }, needsResults: true },
      { keys: ['Home', 'or', 'End'], label: 'First or last result', example: { key: 'Home' }, needsResults: true }
    ]
  },
  {
    title: 'The selected result',
    items: [
      { keys: ['o'], label: 'Open in Explorer', example: { key: 'o' }, needsResults: true },
      { keys: ['c'], label: 'Copy its path', example: { key: 'c' }, needsResults: true },
      { keys: ['r'], label: 'Rescan it', example: { key: 'r' }, needsResults: true },
      { keys: ['i'], label: 'Look inside it', example: { key: 'i' }, needsResults: true },
      { keys: ['a'], label: 'Ask the AI to explain it', example: { key: 'a' }, needsResults: true }
    ]
  },
  {
    title: 'Anywhere',
    items: [
      { keys: ['/', 'or', 'Ctrl', 'F'], label: 'Search the results', example: { key: '/' } },
      { keys: ['Ctrl', 'E'], label: 'Export a report', example: { key: 'e', ctrlKey: true } },
      { keys: ['Ctrl', '1', '–', '4'], label: 'Go to Explain, Drive, Results or Settings', example: { key: '3', ctrlKey: true } },
      { keys: ['?'], label: 'Show this list', example: { key: '?', shiftKey: true } },
      { keys: ['Esc'], label: 'Clear the search, or close a dialog', example: { key: 'Escape' } }
    ]
  }
]
