import { describe, expect, it } from 'vitest'
import { buildPayload, redactUser } from '../src/main/ai/sanitize'
import { validateMetadata } from '../src/main/ai/metadata-validate'
import { meta } from './helpers'

describe('redactUser', () => {
  it('replaces the profile folder in any Users path, whatever the name', () => {
    expect(redactUser('C:\\Users\\jdoe\\AppData')).toBe('C:\\Users\\<USER>\\AppData')
    expect(redactUser('D:/users/Someone Else/x')).toBe('D:/users/<USER>/x')
    expect(redactUser('C:\\Users\\HP VICTUS')).toBe('C:\\Users\\<USER>')
  })

  it('replaces the username elsewhere, case-insensitively, but not inside other words', () => {
    expect(redactUser('backup-JDoe.zip', ['jdoe'])).toBe('backup-<USER>.zip')
    expect(redactUser('jdoefoo and xjdoe', ['jdoe'])).toBe('jdoefoo and xjdoe')
  })

  it('handles regex characters and spaces in usernames', () => {
    expect(redactUser('notes of a.b+c (1)', ['a.b+c'])).toBe('notes of <USER> (1)')
    expect(redactUser('HP VICTUS profile', ['HP VICTUS'])).toBe('<USER> profile')
  })

  it('ignores empty usernames and removes duplicates', () => {
    expect(redactUser('hello', ['', '  ', 'bob', 'bob'])).toBe('hello')
  })

  it('leaves unrelated text alone', () => {
    expect(redactUser('C:\\Program Files\\App', ['jdoe'])).toBe('C:\\Program Files\\App')
  })
})

describe('buildPayload', () => {
  it('never contains the username anywhere in what is sent', () => {
    const payload = buildPayload(
      meta({ sampleFileNames: ['jdoe-backup.zip', 'readme.txt'], name: 'jdoe' }),
      ['jdoe']
    )
    expect(JSON.stringify(payload).toLowerCase()).not.toContain('jdoe')
    expect(payload.path).toBe('C:\\Users\\<USER>\\AppData\\Local\\Acme\\Cache')
    expect(payload.folderName).toBe('<USER>')
  })

  it('sends only the expected metadata fields', () => {
    const payload = buildPayload(meta(), ['jdoe'])
    expect(Object.keys(payload).sort()).toEqual(
      ['createdAt', 'extensionCounts', 'fileCount', 'folderName', 'modifiedAt', 'newestFileAt', 'oldestFileAt', 'path', 'sampleFileNames', 'sizeBytes', 'subfolderCount'].sort()
    )
  })
})

describe('validateMetadata', () => {
  it('accepts scanner output', () => {
    expect(validateMetadata(meta()).fileCount).toBe(3)
  })

  it('strips unknown fields', () => {
    const v = validateMetadata({ ...meta(), secret: 'password123', apiKey: 'sk-ant-xyz' })
    expect(JSON.stringify(v)).not.toContain('password123')
    expect(JSON.stringify(v)).not.toContain('sk-ant')
  })

  it.each([
    ['null', null],
    ['a string', 'C:\\x'],
    ['missing path', { ...meta(), path: undefined }],
    ['negative size', meta({ sizeBytes: -1 })],
    ['NaN count', meta({ fileCount: NaN })],
    ['31 samples', meta({ sampleFileNames: Array.from({ length: 31 }, (_, i) => `f${i}`) })],
    ['an overlong sample name', meta({ sampleFileNames: ['x'.repeat(301)] })],
    ['a non-string sample', meta({ sampleFileNames: [5 as never] })],
    ['51 extensions', meta({ extensionCounts: Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`.e${i}`, 1])) })],
    ['a bad date', meta({ createdAt: 'yesterday-ish' })],
    ['an overlong path', meta({ path: 'C:\\' + 'a'.repeat(2000) })]
  ])('rejects %s', (_label, input) => {
    expect(() => validateMetadata(input)).toThrow(/Invalid folder data/)
  })
})
