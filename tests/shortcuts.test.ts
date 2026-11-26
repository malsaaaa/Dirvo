import { describe, expect, it } from 'vitest'
import { SHORTCUT_GROUPS, keyToAction, movedIndex, type KeyContext, type KeyInput } from '../src/renderer/src/lib/shortcuts'

const onResults: KeyContext = { typing: false, modalOpen: false, screen: 'results' }
const press = (key: string, extra: Partial<KeyInput> = {}, ctx: Partial<KeyContext> = {}): ReturnType<typeof keyToAction> =>
  keyToAction({ key, ...extra }, { ...onResults, ...ctx })

describe('moving through the results', () => {
  it('uses j/k and the arrow keys', () => {
    expect(press('j')).toEqual({ type: 'move', to: 'next' })
    expect(press('ArrowDown')).toEqual({ type: 'move', to: 'next' })
    expect(press('k')).toEqual({ type: 'move', to: 'prev' })
    expect(press('ArrowUp')).toEqual({ type: 'move', to: 'prev' })
    expect(press('Home')).toEqual({ type: 'move', to: 'first' })
    expect(press('End')).toEqual({ type: 'move', to: 'last' })
  })

  it('works with Caps Lock on, but not when Shift is held', () => {
    expect(press('J')).toEqual({ type: 'move', to: 'next' }) // Caps Lock gives a capital letter without Shift
    expect(press('C')).toEqual({ type: 'row', do: 'copy' })
    expect(press('J', { shiftKey: true })).toBeNull() // Shift+J is a different key combination
  })

  it('only moves on the results screen', () => {
    for (const screen of ['pick', 'drive', 'settings'] as const) {
      expect(press('j', {}, { screen })).toBeNull()
      expect(press('ArrowDown', {}, { screen })).toBeNull()
    }
  })
})

describe('acting on the selected folder', () => {
  it.each([
    ['o', 'open'],
    ['c', 'copy'],
    ['r', 'rescan'],
    ['i', 'lookInside'],
    ['a', 'explainAi']
  ] as const)('%s is %s', (key, action) => {
    expect(press(key)).toEqual({ type: 'row', do: action })
  })

  it('only works on the results screen', () => {
    expect(press('c', {}, { screen: 'pick' })).toBeNull()
    expect(press('r', {}, { screen: 'settings' })).toBeNull()
  })

  it('does not take Ctrl+C (copy), Ctrl+R (reload) or Alt+key', () => {
    expect(press('c', { ctrlKey: true })).toBeNull()
    expect(press('r', { ctrlKey: true })).toBeNull()
    expect(press('o', { metaKey: true })).toBeNull()
    expect(press('a', { altKey: true })).toBeNull()
    expect(press('i', { ctrlKey: true, altKey: true })).toBeNull()
  })
})

describe('never steals keys from a text field or a dialog', () => {
  it('ignores plain keys while typing', () => {
    for (const key of ['j', 'k', 'c', 'o', 'r', 'i', 'a', '/', '?', 'ArrowDown', 'Home']) {
      expect(press(key, key === '?' ? { shiftKey: true } : {}, { typing: true }), key).toBeNull()
    }
  })

  it('ignores everything while a dialog is open', () => {
    for (const key of ['j', 'c', '/', '?', 'ArrowDown']) expect(press(key, {}, { modalOpen: true }), key).toBeNull()
    expect(press('e', { ctrlKey: true }, { modalOpen: true })).toBeNull()
    expect(press('3', { ctrlKey: true }, { modalOpen: true })).toBeNull()
  })
})

describe('search, export, help and screens', () => {
  it('/ and Ctrl+F focus the search, from any screen', () => {
    expect(press('/', {}, { screen: 'settings' })).toEqual({ type: 'search' })
    expect(press('f', { ctrlKey: true }, { screen: 'drive' })).toEqual({ type: 'search' })
    expect(press('F', { ctrlKey: true })).toEqual({ type: 'search' })
    expect(press('f', { metaKey: true })).toEqual({ type: 'search' })
  })

  it('Ctrl+F works even while typing, so it can refocus the search box', () => {
    expect(press('f', { ctrlKey: true }, { typing: true })).toEqual({ type: 'search' })
  })

  it('Ctrl+E exports, even while typing', () => {
    expect(press('e', { ctrlKey: true })).toEqual({ type: 'export' })
    expect(press('e', { ctrlKey: true }, { typing: true })).toEqual({ type: 'export' })
  })

  it('? shows help, and plain / does not need shift', () => {
    expect(press('?', { shiftKey: true })).toEqual({ type: 'help' })
    expect(press('?', { shiftKey: true }, { screen: 'settings' })).toEqual({ type: 'help' })
  })

  it('Ctrl+1 to Ctrl+4 switch screens', () => {
    expect(press('1', { ctrlKey: true })).toEqual({ type: 'screen', screen: 'pick' })
    expect(press('2', { ctrlKey: true })).toEqual({ type: 'screen', screen: 'drive' })
    expect(press('3', { ctrlKey: true })).toEqual({ type: 'screen', screen: 'results' })
    expect(press('4', { ctrlKey: true }, { typing: true })).toEqual({ type: 'screen', screen: 'settings' })
    expect(press('5', { ctrlKey: true })).toBeNull()
    expect(press('0', { ctrlKey: true })).toBeNull()
  })

  it('leaves other Ctrl combos alone', () => {
    for (const key of ['c', 'v', 'x', 'a', 'z', 'r', 'w', 'n']) expect(press(key, { ctrlKey: true }), key).toBeNull()
  })

  it('ignores unrelated keys', () => {
    for (const key of ['Enter', 'Tab', 'Escape', ' ', 'x', 'z', '1', 'F5', 'PageDown']) expect(press(key), key).toBeNull()
  })
})

describe('movedIndex', () => {
  it('moves by one and stops at the ends', () => {
    expect(movedIndex(2, 5, 'next')).toBe(3)
    expect(movedIndex(2, 5, 'prev')).toBe(1)
    expect(movedIndex(4, 5, 'next')).toBe(4)
    expect(movedIndex(0, 5, 'prev')).toBe(0)
  })

  it('jumps to the first and last', () => {
    expect(movedIndex(2, 5, 'first')).toBe(0)
    expect(movedIndex(2, 5, 'last')).toBe(4)
  })

  it('starts at the top when the selected folder is not in the list (for example filtered out)', () => {
    expect(movedIndex(-1, 5, 'next')).toBe(0)
    expect(movedIndex(-1, 5, 'prev')).toBe(0)
  })

  it('does nothing with an empty list', () => {
    expect(movedIndex(-1, 0, 'next')).toBe(-1)
    expect(movedIndex(0, 0, 'first')).toBe(-1)
  })
})

describe('the help list matches the real shortcuts', () => {
  it('every documented shortcut does something', () => {
    for (const group of SHORTCUT_GROUPS) {
      for (const s of group.items) {
        if (s.example.key === 'Escape') continue // handled by the search box and dialogs themselves
        const action = keyToAction(s.example, { typing: false, modalOpen: false, screen: s.needsResults ? 'results' : 'settings' })
        expect(action, s.label).not.toBeNull()
      }
    }
  })

  it('has a label and keys for each entry', () => {
    for (const g of SHORTCUT_GROUPS) {
      expect(g.items.length).toBeGreaterThan(0)
      for (const s of g.items) {
        expect(s.label.length).toBeGreaterThan(3)
        expect(s.keys.length).toBeGreaterThan(0)
      }
    }
  })
})
