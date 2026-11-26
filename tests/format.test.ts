import { describe, expect, it } from 'vitest'
import { formatBytes, formatCount, formatDate, shortenPath } from '../src/renderer/src/lib/format'

describe('formatBytes', () => {
  it('formats common sizes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(-5)).toBe('0 B')
    expect(formatBytes(NaN)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(10 * 1024)).toBe('10 KB')
    expect(formatBytes(498_983_264)).toBe('476 MB')
    expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GB')
    expect(formatBytes(3 * 1024 ** 4)).toBe('3.0 TB')
  })
  it('caps at TB', () => {
    expect(formatBytes(5000 * 1024 ** 4)).toBe('5000 TB')
  })
})

describe('formatCount / formatDate', () => {
  it('groups digits', () => expect(formatCount(1234567)).toBe('1,234,567'))
  it('handles missing and invalid dates', () => {
    expect(formatDate(null)).toBe('Unknown')
    expect(formatDate('nope')).toBe('Unknown')
    expect(formatDate('2024-06-15T12:00:00Z')).toMatch(/2024/)
  })
})

describe('shortenPath', () => {
  it('leaves short paths alone', () => expect(shortenPath('C:\\a\\b', 60)).toBe('C:\\a\\b'))
  it('shortens in the middle and keeps the end', () => {
    const p = 'C:\\Users\\Alice\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache'
    const s = shortenPath(p, 40)
    expect(s).toHaveLength(40)
    expect(s.startsWith('C:\\Users')).toBe(true)
    expect(s.endsWith('Default\\Cache')).toBe(true)
    expect(s).toContain('…')
  })
})
