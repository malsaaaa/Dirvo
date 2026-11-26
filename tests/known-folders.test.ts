import { describe, expect, it } from 'vitest'
import knownFoldersJson from '../data/known-folders.json'
import { compilePattern, matchesAncestor, matchesPath, splitPath } from '../src/main/knowledge/path-pattern'
import { createMatcher, validateDatabase } from '../src/main/knowledge/known-folders'

const matches = (pattern: string, path: string): boolean => matchesPath(compilePattern(pattern), splitPath(path))
const inside = (pattern: string, path: string): boolean => matchesAncestor(compilePattern(pattern), splitPath(path))

describe('path patterns', () => {
  it('splits Windows paths, ignoring case, slashes and long-path prefix', () => {
    expect(splitPath('C:\\Users\\Bob\\')).toEqual(['c:', 'users', 'bob'])
    expect(splitPath('\\\\?\\C:\\Temp')).toEqual(['c:', 'temp'])
    expect(splitPath('c:/a//b')).toEqual(['c:', 'a', 'b'])
  })

  it('unanchored patterns match the end of a path only', () => {
    expect(matches('node_modules', 'D:\\work\\app\\node_modules')).toBe(true)
    expect(matches('NODE_MODULES', 'd:\\work\\app\\Node_Modules')).toBe(true)
    expect(matches('node_modules', 'D:\\work\\node_modules\\react')).toBe(false)
    expect(matches('.gradle/caches', 'C:\\x\\.gradle\\caches')).toBe(true)
    expect(matches('.gradle/caches', 'C:\\x\\gradle\\caches')).toBe(false)
  })

  it('"~" anchors to a user profile on any drive', () => {
    expect(matches('~/AppData/Local/Temp', 'C:\\Users\\Alice\\AppData\\Local\\Temp')).toBe(true)
    expect(matches('~/AppData/Local/Temp', 'E:\\Users\\Bob Smith\\AppData\\Local\\Temp')).toBe(true)
    expect(matches('~/AppData/Local/Temp', 'D:\\backup\\AppData\\Local\\Temp')).toBe(false)
    expect(matches('~/AppData/Local/Temp', 'C:\\Users\\Alice\\x\\AppData\\Local\\Temp')).toBe(false)
  })

  it('"<drive>" anchors to the drive root', () => {
    expect(matches('<drive>/Windows/Temp', 'C:\\Windows\\Temp')).toBe(true)
    expect(matches('<drive>/Windows/Temp', 'D:\\Work\\Windows\\Temp')).toBe(false)
    expect(matches('<drive>', 'C:\\')).toBe(true)
    expect(matches('<drive>', 'C:\\Windows')).toBe(false)
  })

  it('supports wildcards inside a segment', () => {
    expect(matches('~/AppData/Local/Google/Chrome/User Data/*/Cache', 'C:\\Users\\a\\AppData\\Local\\Google\\Chrome\\User Data\\Profile 3\\Cache')).toBe(true)
    expect(matches('~/AppData/Local/Packages/CanonicalGroupLimited*', 'C:\\Users\\a\\AppData\\Local\\Packages\\CanonicalGroupLimited.Ubuntu22.04LTS_79rhkp1fndgsc')).toBe(true)
    expect(matches('~/AppData/Local/Packages/CanonicalGroupLimited*', 'C:\\Users\\a\\AppData\\Local\\Packages\\Other')).toBe(false)
  })

  it('finds ancestors', () => {
    expect(inside('node_modules', 'C:\\app\\node_modules\\react\\lib')).toBe(true)
    expect(inside('node_modules', 'C:\\app\\node_modules')).toBe(false)
    expect(inside('<drive>/Windows/WinSxS', 'C:\\Windows\\WinSxS\\amd64_x')).toBe(true)
    expect(inside('<drive>/Windows/WinSxS', 'D:\\Windows\\WinSxS\\amd64_x')).toBe(true)
    expect(inside('<drive>/Windows/WinSxS', 'C:\\data\\Windows\\WinSxS\\x')).toBe(false)
  })

  it('rejects malformed patterns', () => {
    expect(() => compilePattern('')).toThrow()
    expect(() => compilePattern('a/<drive>')).toThrow()
  })
})

describe('database validation', () => {
  const good = {
    id: 'x',
    patterns: ['node_modules'],
    whatItIs: 'a',
    createdBy: 'b',
    verdict: 'SAFE',
    consequenceIfDeleted: 'c'
  }

  it('accepts the shipped database', () => {
    const entries = validateDatabase(knownFoldersJson)
    expect(entries.length).toBeGreaterThan(40)
  })

  it('rejects bad data', () => {
    expect(() => validateDatabase({})).toThrow(/array/)
    expect(() => validateDatabase([{ ...good, verdict: 'MAYBE' }])).toThrow(/verdict/)
    expect(() => validateDatabase([{ ...good, patterns: [] }])).toThrow(/patterns/)
    expect(() => validateDatabase([{ ...good, patterns: ['a/*'] }])).toThrow(/wildcard/)
    expect(() => validateDatabase([{ ...good, patterns: ['ab'] }])).toThrow(/too short/)
    expect(() => validateDatabase([{ ...good, patterns: ['~/a/*'] }])).not.toThrow() // pinned location is fine
    expect(() => validateDatabase([{ ...good, whatItIs: '' }])).toThrow(/whatItIs/)
    expect(() => validateDatabase([{ ...good, confidence: 'SURE' }])).toThrow(/confidence/)
    expect(() => validateDatabase([good, good])).toThrow(/duplicate/)
  })

  it('folders holding irreplaceable data are never rated safer than they should be', () => {
    const entries = new Map(validateDatabase(knownFoldersJson).map((e) => [e.id, e.verdict]))
    const dontTouch = ['git-folder', 'chrome-profile', 'edge-profile', 'brave-profile', 'firefox-profile', 'vscode-user',
      'docker-wsl-data', 'wsl-distro', 'winsxs', 'system32', 'windows-installer', 'recycle-bin', 'system-volume-information']
    const atLeastCaution = ['docker-local', 'docker-programdata', 'package-cache', 'windows-old', 'python-venv', 'steam-library',
      'outlook-data', 'user-programs', 'gradle-home', 'maven-home', 'cargo-home', 'ollama-models', 'uwp-packages']
    for (const id of dontTouch) expect(entries.get(id), id).toBe('DONT_TOUCH')
    for (const id of atLeastCaution) expect(['CAUTION', 'DONT_TOUCH'], id).toContain(entries.get(id))
  })
})

describe('matcher with the shipped database', () => {
  const matcher = createMatcher(validateDatabase(knownFoldersJson))
  const id = (path: string): string | undefined => matcher.match(path)?.entry.id
  const verdict = (path: string): string | undefined => matcher.match(path)?.entry.verdict

  it.each([
    ['C:\\proj\\web\\node_modules', 'node-modules', 'SAFE'],
    ['C:\\proj\\web\\node_modules\\react\\cjs', 'node-modules', 'SAFE'],
    ['C:\\Users\\a\\AppData\\Local\\npm-cache', 'npm-cache', 'REBUILDS_AUTOMATICALLY'],
    ['C:\\Users\\a\\.gradle\\caches', 'gradle-caches', 'REBUILDS_AUTOMATICALLY'],
    ['C:\\Users\\a\\.gradle\\caches\\modules-2', 'gradle-caches', 'REBUILDS_AUTOMATICALLY'],
    ['C:\\Users\\a\\.gradle', 'gradle-home', 'CAUTION'],
    ['C:\\proj\\app\\.gradle', 'gradle-project', 'REBUILDS_AUTOMATICALLY'],
    ['C:\\Users\\a\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache', 'chrome-cache', 'REBUILDS_AUTOMATICALLY'],
    ['C:\\Users\\a\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache\\Cache_Data', 'chrome-cache', 'REBUILDS_AUTOMATICALLY'],
    ['C:\\Users\\a\\AppData\\Local\\Google\\Chrome\\User Data\\Default', 'chrome-profile', 'DONT_TOUCH'],
    ['C:\\Users\\a\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Extensions', 'chrome-profile', 'DONT_TOUCH'],
    ['C:\\Users\\a\\AppData\\Local\\Microsoft\\Edge\\User Data\\Profile 1\\Code Cache', 'edge-cache', 'REBUILDS_AUTOMATICALLY'],
    ['C:\\Users\\a\\AppData\\Local\\Temp', 'user-temp', 'SAFE'],
    ['C:\\Windows\\Temp', 'user-temp', 'SAFE'],
    ['C:\\Windows\\SoftwareDistribution\\Download', 'windows-update-download', 'REBUILDS_AUTOMATICALLY'],
    ['C:\\Windows\\SoftwareDistribution', 'windows-update-store', 'CAUTION'],
    ['C:\\ProgramData\\Package Cache', 'package-cache', 'CAUTION'],
    ['C:\\Users\\a\\AppData\\Local\\Docker\\wsl\\data', 'docker-wsl-data', 'DONT_TOUCH'],
    ['C:\\Users\\a\\AppData\\Local\\Docker', 'docker-local', 'CAUTION'],
    ['C:\\proj\\.git', 'git-folder', 'DONT_TOUCH'],
    ['C:\\proj\\.git\\objects', 'git-folder', 'DONT_TOUCH'],
    ['C:\\$Recycle.Bin', 'recycle-bin', 'DONT_TOUCH'],
    ['C:\\Users\\a\\AppData\\Local\\Programs', 'user-programs', 'CAUTION'],
    ['C:\\Users\\a\\AppData\\Local\\Programs\\Ollama\\lib', 'user-programs', 'CAUTION'],
    ['C:\\Windows\\WinSxS', 'winsxs', 'DONT_TOUCH']
  ])('%s -> %s (%s)', (path, expectedId, expectedVerdict) => {
    expect(id(path)).toBe(expectedId)
    expect(verdict(path)).toBe(expectedVerdict)
  })

  it('returns null for unknown folders', () => {
    expect(matcher.match('C:\\Users\\a\\Stuff\\MysteryFolder')).toBeNull()
    expect(matcher.match('C:\\')).toBeNull()
  })

  it('does not match lookalikes in the wrong place', () => {
    expect(matcher.match('D:\\backup\\AppData\\Local\\npm-cache')).toBeNull()
    expect(matcher.match('D:\\Work\\Windows\\Temp')).toBeNull()
    expect(matcher.match('C:\\Users\\a\\node_modules_backup')).toBeNull()
  })

  it('prefers the most specific entry', () => {
    // .gradle is CAUTION in the profile, but the caches folder inside it is rebuildable
    expect(id('C:\\Users\\a\\.gradle\\wrapper')).toBe('gradle-wrapper')
    expect(id('C:\\Users\\a\\.gradle\\init.d')).toBe('gradle-home')
  })
})
