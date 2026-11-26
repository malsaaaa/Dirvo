import { describe, expect, it } from 'vitest'
import { IDLE_NOTICE_DAYS, IDLE_YEAR_DAYS, idleDays, idleLabel, isIdle } from '../src/renderer/src/lib/age'
import type { ScannedFolder } from '../src/shared/types'
import { meta } from './helpers'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-11-26T12:00:00.000Z')
const daysAgo = (n: number): string => new Date(NOW - n * DAY).toISOString()

const item = (newest: string | null, modified: string | null = null): ScannedFolder => ({
  metadata: meta({ path: 'C:\\a\\x', name: 'x', newestFileAt: newest, modifiedAt: modified }),
  explanation: null,
  aiStatus: 'none',
  scannedAt: '2026-11-26T10:00:00.000Z'
})

describe('idleDays', () => {
  it('counts whole days since the newest file', () => {
    expect(idleDays(item(daysAgo(0)), NOW)).toBe(0)
    expect(idleDays(item(daysAgo(1)), NOW)).toBe(1)
    expect(idleDays(item(daysAgo(400)), NOW)).toBe(400)
  })

  it('falls back to the folder date when there are no files', () => {
    expect(idleDays(item(null, daysAgo(200)), NOW)).toBe(200)
  })

  it('prefers the newest file over the folder date', () => {
    expect(idleDays(item(daysAgo(10), daysAgo(500)), NOW)).toBe(10)
  })

  it('is null with no usable date', () => {
    expect(idleDays(item(null, null), NOW)).toBeNull()
    expect(idleDays(item('not a date', null), NOW)).toBeNull()
  })

  it('treats a date in the future as zero instead of negative', () => {
    expect(idleDays(item(new Date(NOW + 5 * DAY).toISOString()), NOW)).toBe(0)
  })
})

describe('isIdle', () => {
  it('is true at and beyond the limit, false below it', () => {
    expect(isIdle(item(daysAgo(364)), IDLE_YEAR_DAYS, NOW)).toBe(false)
    expect(isIdle(item(daysAgo(365)), IDLE_YEAR_DAYS, NOW)).toBe(true)
    expect(isIdle(item(daysAgo(900)), IDLE_YEAR_DAYS, NOW)).toBe(true)
  })

  it('never counts an unknown date as idle', () => {
    expect(isIdle(item(null, null), IDLE_YEAR_DAYS, NOW)).toBe(false)
  })
})

describe('idleLabel', () => {
  it('says nothing for recent folders', () => {
    expect(idleLabel(null)).toBeNull()
    expect(idleLabel(0)).toBeNull()
    expect(idleLabel(IDLE_NOTICE_DAYS - 1)).toBeNull()
  })

  it('uses months from the notice limit up to a year', () => {
    expect(idleLabel(IDLE_NOTICE_DAYS)).toEqual({ short: '3 mo', long: '3 months' })
    expect(idleLabel(200)).toEqual({ short: '6 mo', long: '6 months' })
    expect(idleLabel(364)).toEqual({ short: '12 mo', long: '12 months' })
  })

  it('uses whole years from a year on, with the right plural', () => {
    expect(idleLabel(365)).toEqual({ short: '1 y', long: '1 year' })
    expect(idleLabel(729)).toEqual({ short: '1 y', long: '1 year' })
    expect(idleLabel(730)).toEqual({ short: '2 y', long: '2 years' })
    expect(idleLabel(3650)).toEqual({ short: '10 y', long: '10 years' })
  })
})
