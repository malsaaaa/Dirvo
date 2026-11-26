import { describe, expect, it } from 'vitest'
import knownFoldersJson from '../data/known-folders.json'
import {
  ALLOWED_CLEAN_COMMANDS,
  SETTINGS_URIS,
  isAllowedCleanCommand,
  isSettingsTarget
} from '../src/main/knowledge/clean-commands'
import { validateDatabase } from '../src/main/knowledge/known-folders'
import { explainPath } from '../src/main/knowledge/explain'

const good = {
  id: 'x',
  patterns: ['node_modules'],
  whatItIs: 'a',
  createdBy: 'b',
  verdict: 'SAFE',
  consequenceIfDeleted: 'c'
}

describe('the cleanup command allow-list', () => {
  it('contains only a tool cleaning its own cache, never a generic delete command', () => {
    for (const c of ALLOWED_CLEAN_COMMANDS) {
      expect(c, c).not.toMatch(/\b(rm|del|erase|rd|rmdir|remove-item|ri|format|diskpart|robocopy|takeown|icacls)\b/i)
      expect(c, c).not.toMatch(/-Recurse|\/s\b|\/q\b|-Force\b(?!$)|&&|\|\||;|\||>|<|`|\$\(/)
      expect(c, c).not.toMatch(/[\r\n]/)
    }
  })

  it('only matches exact commands', () => {
    expect(isAllowedCleanCommand('npm cache clean --force')).toBe(true)
    expect(isAllowedCleanCommand('docker system prune')).toBe(true)
    for (const bad of [
      'rm -rf /',
      'del /s /q C:\\Users',
      'Remove-Item -Recurse -Force C:\\Users',
      'npm cache clean --force && del x',
      'npm cache clean --force ',
      ' npm cache clean --force',
      'NPM cache clean --force',
      'docker system prune -a --volumes', // would also delete volumes (your data)
      'npm cache clean',
      '',
      null,
      undefined,
      42
    ]) {
      expect(isAllowedCleanCommand(bad), String(bad)).toBe(false)
    }
  })

  it('only opens the Windows Settings pages it lists', () => {
    expect(isSettingsTarget('storage')).toBe(true)
    expect(isSettingsTarget('apps')).toBe(true)
    for (const bad of ['', 'cmd', 'https://evil.example.com', 'ms-settings:privacy', 'constructor', '__proto__', null, 5]) {
      expect(isSettingsTarget(bad), String(bad)).toBe(false)
    }
    for (const uri of Object.values(SETTINGS_URIS)) expect(uri.startsWith('ms-settings:')).toBe(true)
  })
})

describe('howToClean validation', () => {
  it('accepts text, an allow-listed command, and a settings page', () => {
    const [e] = validateDatabase([
      { ...good, howToClean: { text: 'Do it carefully.', command: 'npm cache clean --force', settings: 'storage' } }
    ])
    expect(e.howToClean).toEqual({ text: 'Do it carefully.', command: 'npm cache clean --force', settings: 'storage' })
  })

  it('works without howToClean', () => {
    expect(validateDatabase([good])[0].howToClean).toBeUndefined()
  })

  it.each([
    ['a delete command', { text: 'x', command: 'rm -rf C:\\Users' }],
    ['a PowerShell delete', { text: 'x', command: 'Remove-Item -Recurse C:\\Windows' }],
    ['an allowed command chained with another', { text: 'x', command: 'npm cache clean --force && del *' }],
    ['a command that is not a string', { text: 'x', command: 5 }],
    ['empty text', { text: '   ' }],
    ['missing text', { command: 'npm cache clean --force' }],
    ['overlong text', { text: 'x'.repeat(501) }],
    ['an unknown settings page', { text: 'x', settings: 'privacy' }],
    ['not an object', 'just a string']
  ])('rejects %s', (_label, howToClean) => {
    expect(() => validateDatabase([{ ...good, howToClean }])).toThrow(/howToClean/)
  })
})

describe('the shipped database', () => {
  const entries = validateDatabase(knownFoldersJson)
  const byId = new Map(entries.map((e) => [e.id, e]))

  it('has cleanup advice for the common cases', () => {
    expect(entries.filter((e) => e.howToClean).length).toBeGreaterThan(40)
  })

  it('every command is allow-listed and every text is plain advice', () => {
    for (const e of entries) {
      const h = e.howToClean
      if (!h) continue
      if (h.command) expect(isAllowedCleanCommand(h.command), e.id).toBe(true)
      expect(h.text.length, e.id).toBeGreaterThan(10)
      // Advice must never tell people to wipe things with a destructive one-liner.
      expect(h.text, e.id).not.toMatch(/Remove-Item|rm -rf|del \/|rd \/s|format c/i)
    }
  })

  it('points to the right tool for each cache', () => {
    expect(byId.get('npm-cache')?.howToClean?.command).toBe('npm cache clean --force')
    expect(byId.get('pip-cache')?.howToClean?.command).toBe('pip cache purge')
    expect(byId.get('go-build-cache')?.howToClean?.command).toBe('go clean -cache')
    expect(byId.get('winsxs')?.howToClean?.command).toBe('DISM /Online /Cleanup-Image /StartComponentCleanup')
    expect(byId.get('user-temp')?.howToClean?.settings).toBe('storage')
    expect(byId.get('user-programs')?.howToClean?.settings).toBe('apps')
  })

  it('never suggests deleting Docker, WinSxS or browser data by hand', () => {
    expect(byId.get('docker-wsl-data')?.howToClean?.text).toMatch(/do not delete/i)
    expect(byId.get('winsxs')?.howToClean?.text).toMatch(/never delete/i)
    expect(byId.get('chrome-cache')?.howToClean?.text).toMatch(/safer than deleting/i)
  })

  it('does not hand out cleanup advice for folders that must not be touched', () => {
    for (const id of ['git-folder', 'chrome-profile', 'vscode-user', 'system32', 'windows-installer', 'wsl-distro']) {
      expect(byId.get(id)?.howToClean, id).toBeUndefined()
    }
  })
})

describe('howToClean reaches the answer', () => {
  it('is included for database matches', () => {
    const r = explainPath('C:\\Users\\Alice\\AppData\\Local\\npm-cache')
    expect(r?.howToClean).toMatchObject({ command: 'npm cache clean --force' })
  })

  it('is included for matches inside a protected system tree', () => {
    expect(explainPath('C:\\Windows\\WinSxS')?.howToClean?.command).toContain('DISM')
  })

  it('is absent for system rules and unknown folders', () => {
    expect(explainPath('C:\\Windows')?.howToClean).toBeUndefined()
    expect(explainPath('C:\\Users\\Alice\\Documents')?.howToClean).toBeUndefined()
    expect(explainPath('C:\\Users\\Alice\\Mystery')).toBeNull()
  })
})
