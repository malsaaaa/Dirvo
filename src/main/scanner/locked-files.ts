import { execFile } from 'node:child_process'
import { join } from 'node:path'

/**
 * Windows keeps a few of its biggest files (pagefile.sys, hiberfil.sys, swapfile.sys) locked, so opening
 * them even just to read their size fails with EBUSY. They still show up in a folder listing, which carries
 * each file's size and dates. This reads that listing, once, for just the locked files.
 *
 * It is only a fallback after lstat fails. It reads metadata only, never file contents, and the script is a
 * fixed string: the folder and file names reach it through environment variables, never through the command
 * line or the script text, so a strange file name cannot change what runs.
 */
export interface LockedStat {
  size: number
  mtimeMs: number
  birthtimeMs: number
}

/** Names are matched without regard to case, so the keys are lower-cased. */
export type LockedStatFn = (dir: string, names: string[]) => Promise<Map<string, LockedStat>>

const SCRIPT = `$ErrorActionPreference = 'Stop'
$names = $env:DIRVO_NAMES | ConvertFrom-Json
Get-ChildItem -LiteralPath $env:DIRVO_DIR -Force -File | Where-Object { $names -contains $_.Name } | ForEach-Object { [pscustomobject]@{ n = $_.Name; s = $_.Length; m = $_.LastWriteTimeUtc.ToString('o'); c = $_.CreationTimeUtc.ToString('o') } } | ConvertTo-Json -Compress`

const MAX_NAMES = 50
const TIMEOUT_MS = 15_000

/** The errors that mean "Windows has this file open or protected", as opposed to "it is not there". */
export function isLockedError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code
  return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES'
}

/** Reads the script's JSON. Anything malformed is ignored rather than trusted. */
export function parseLockedOutput(stdout: string): Map<string, LockedStat> {
  const out = new Map<string, LockedStat>()
  const text = stdout.trim()
  if (text === '') return out
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return out
  }
  for (const row of Array.isArray(data) ? data : [data]) {
    if (typeof row !== 'object' || row === null) continue
    const r = row as Record<string, unknown>
    const m = typeof r.m === 'string' ? Date.parse(r.m) : NaN
    const c = typeof r.c === 'string' ? Date.parse(r.c) : NaN
    if (typeof r.n !== 'string' || r.n === '' || typeof r.s !== 'number' || !Number.isFinite(r.s) || r.s < 0) continue
    out.set(r.n.toLowerCase(), { size: r.s, mtimeMs: Number.isNaN(m) ? 0 : m, birthtimeMs: Number.isNaN(c) ? 0 : c })
  }
  return out
}

/** Runs a program and returns what it printed. Injected so tests never start a real process. */
export type RunFn = (file: string, args: string[], env: Record<string, string>) => Promise<string>

const realRun: RunFn = (file, args, env) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { env: { ...process.env, ...env }, timeout: TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(stdout))
    )
  })

export function createLockedStat(run: RunFn = realRun, systemRoot: string = process.env['SystemRoot'] ?? 'C:\\Windows'): LockedStatFn {
  // The full path, so nothing on the PATH can stand in for it.
  const powershell = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  return async (dir, names) => {
    const wanted = names.filter((n) => typeof n === 'string' && n !== '').slice(0, MAX_NAMES)
    if (wanted.length === 0) return new Map()
    try {
      const stdout = await run(powershell, ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], {
        DIRVO_DIR: dir,
        DIRVO_NAMES: JSON.stringify(wanted)
      })
      return parseLockedOutput(stdout)
    } catch {
      return new Map() // no PowerShell, a timeout, a denied folder: the files are simply not listed
    }
  }
}
