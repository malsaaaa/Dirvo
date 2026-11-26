import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, resolveTheme } from '../src/renderer/src/lib/theme'

describe('resolveTheme', () => {
  it('defaults to dark', () => {
    expect(DEFAULT_THEME).toBe('dark')
    expect(resolveTheme(null)).toBe('dark')
    expect(resolveTheme(undefined)).toBe('dark')
    expect(resolveTheme('')).toBe('dark')
  })

  it('keeps a saved choice', () => {
    expect(resolveTheme('light')).toBe('light')
    expect(resolveTheme('dark')).toBe('dark')
  })

  it('ignores anything unexpected', () => {
    expect(resolveTheme('Light')).toBe('dark')
    expect(resolveTheme('system')).toBe('dark')
    expect(resolveTheme('{"x":1}')).toBe('dark')
  })
})
