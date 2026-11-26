import { describe, expect, it } from 'vitest'
import { explainPath } from '../src/main/knowledge/explain'

const verdict = (path: string): string | undefined => explainPath(path)?.verdict

describe('system paths are always DONT_TOUCH', () => {
  it.each([
    'C:\\',
    'D:\\',
    'C:\\Windows',
    'c:\\windows\\',
    'C:\\Program Files',
    'C:\\Program Files (x86)',
    'C:\\ProgramData',
    'C:\\Users',
    'C:\\Users\\Alice',
    'C:\\Users\\Bob Smith',
    'C:\\Users\\Alice\\Documents',
    'C:\\Users\\Alice\\Desktop',
    'C:\\Users\\Alice\\Downloads',
    'C:\\Users\\Alice\\OneDrive',
    'C:\\Users\\Alice\\OneDrive - Contoso\\Documents',
    'C:\\Users\\Alice\\AppData',
    'C:\\Users\\Alice\\AppData\\Local',
    'C:\\Users\\Alice\\AppData\\Roaming',
    'D:\\Users\\Alice\\Desktop'
  ])('%s', (path) => {
    const r = explainPath(path)
    expect(r?.verdict).toBe('DONT_TOUCH')
    expect(r?.source).toBe('system')
    expect(r?.confidence).toBe('HIGH')
  })

  it('anything else inside Windows or Program Files is DONT_TOUCH', () => {
    expect(verdict('C:\\Windows\\System32')).toBe('DONT_TOUCH')
    expect(verdict('C:\\Windows\\System32\\drivers')).toBe('DONT_TOUCH')
    expect(verdict('C:\\Windows\\Fonts')).toBe('DONT_TOUCH')
    expect(verdict('C:\\Program Files\\Git')).toBe('DONT_TOUCH')
    expect(verdict('C:\\Program Files (x86)\\Steam\\steamapps')).toBe('DONT_TOUCH')
  })

  it('a generic database entry cannot green-light something inside a system tree', () => {
    expect(verdict('C:\\Program Files\\SomeApp\\node_modules')).toBe('DONT_TOUCH')
    expect(verdict('C:\\Windows\\Something\\__pycache__')).toBe('DONT_TOUCH')
  })

  it('but system-specific database entries still apply', () => {
    expect(explainPath('C:\\Windows\\Temp')).toMatchObject({ verdict: 'SAFE', source: 'database', matchedId: 'user-temp' })
    expect(verdict('C:\\Windows\\SoftwareDistribution\\Download')).toBe('REBUILDS_AUTOMATICALLY')
    expect(verdict('C:\\Windows\\Installer')).toBe('DONT_TOUCH')
  })

  it('user data inside the profile is not blanket-protected, only the named folders', () => {
    expect(verdict('C:\\Users\\Alice\\Projects\\app\\node_modules')).toBe('SAFE')
    expect(explainPath('C:\\Users\\Alice\\Projects\\mystery')).toBeNull()
  })
})

describe('explainPath', () => {
  it('answers from the database with its details', () => {
    const r = explainPath('C:\\Users\\Alice\\AppData\\Local\\npm-cache')
    expect(r).toMatchObject({
      verdict: 'REBUILDS_AUTOMATICALLY',
      createdBy: 'npm',
      source: 'database',
      confidence: 'HIGH',
      matchedId: 'npm-cache'
    })
    expect(r?.whatItIs.length).toBeGreaterThan(10)
    expect(r?.consequenceIfDeleted.length).toBeGreaterThan(10)
  })

  it('marks matches found by ancestry', () => {
    expect(explainPath('C:\\app\\node_modules\\react')?.matchedId).toBe('node-modules (inside)')
  })

  it('returns null for unknown folders so the AI fallback can take over', () => {
    expect(explainPath('C:\\Users\\Alice\\AppData\\Local\\SomeRandomVendor\\Data')).toBeNull()
  })

  it('treats ambiguous folders with lower confidence', () => {
    expect(explainPath('C:\\code\\proj\\venv')?.confidence).toBe('MEDIUM')
  })
})
