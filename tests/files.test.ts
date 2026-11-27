import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import type { Dirent, Stats } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import knownFiles from '../data/known-files.json'
import { AiCache } from '../src/main/ai/cache'
import { KeyStore, type Encryptor } from '../src/main/ai/key-store'
import { validateMetadata } from '../src/main/ai/metadata-validate'
import { AiSettingsStore } from '../src/main/ai/provider-settings'
import { buildFilePayload } from '../src/main/ai/sanitize'
import { explainWithAi, type AiServiceDeps } from '../src/main/ai/service'
import { explainFilePath } from '../src/main/knowledge/explain-file'
import { validateDatabase } from '../src/main/knowledge/known-folders'
import { scanFolder } from '../src/main/scanner/scan-core'
import { scanDrive, type DriveScanDeps } from '../src/main/scanner/drive-scan'
import { fileMetadata, inspectFile, listBigFiles, type ListFs } from '../src/main/scanner/scan-file'
import { validateSavedScans } from '../src/main/storage/saved-scans'
import type { DriveScanItem, FolderMetadata, ScanOutcome } from '../src/shared/types'
import type { ProviderId } from '../src/shared/providers'
import { meta } from './helpers'

const MB = 1024 * 1024

const fakeStat = (o: { size?: number; dir?: boolean; link?: boolean; other?: boolean }): Stats =>
  ({
    size: o.size ?? 0,
    mtimeMs: Date.parse('2024-05-01T00:00:00Z'),
    birthtimeMs: Date.parse('2024-01-01T00:00:00Z'),
    isDirectory: () => !!o.dir,
    isSymbolicLink: () => !!o.link,
    isFile: () => !o.dir && !o.link && !o.other
  }) as unknown as Stats

describe('inspectFile', () => {
  it('describes a file with the same fields as a folder', async () => {
    const r = await inspectFile('C:\\x\\Report.PDF', { lstat: async () => fakeStat({ size: 1234 }) })
    expect(r.status).toBe('file')
    if (r.status !== 'file') return
    expect(r.metadata).toMatchObject({
      kind: 'file',
      path: 'C:\\x\\Report.PDF',
      name: 'Report.PDF',
      sizeBytes: 1234,
      fileCount: 1,
      dirCount: 0,
      extensionCounts: { '.pdf': 1 },
      sampleFileNames: []
    })
    expect(r.metadata.modifiedAt).toBe('2024-05-01T00:00:00.000Z')
    expect(r.metadata.newestFileAt).toBe(r.metadata.modifiedAt)
  })

  it('reports a folder as a folder, so it can be scanned as one', async () => {
    expect(await inspectFile('C:\\x', { lstat: async () => fakeStat({ dir: true }) })).toEqual({ status: 'folder' })
  })

  it('refuses links and special files, and reports a missing path', async () => {
    expect((await inspectFile('C:\\l', { lstat: async () => fakeStat({ link: true }) })).status).toBe('error')
    expect((await inspectFile('C:\\p', { lstat: async () => fakeStat({ other: true }) })).status).toBe('error')
    expect((await inspectFile('C:\\gone', { lstat: async () => Promise.reject(new Error('ENOENT')) })).status).toBe('error')
  })

  it('works on a real file and leaves it untouched', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dirvo-file-'))
    try {
      const file = join(dir, 'note.txt')
      writeFileSync(file, 'hello')
      const before = statSync(file).mtimeMs
      const r = await inspectFile(file)
      expect(r).toMatchObject({ status: 'file', metadata: { kind: 'file', sizeBytes: 5, name: 'note.txt' } })
      expect(statSync(file).mtimeMs).toBe(before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('listBigFiles', () => {
  const dirent = (name: string, kind: 'file' | 'dir' | 'link'): Dirent =>
    ({ name, isFile: () => kind === 'file', isDirectory: () => kind === 'dir', isSymbolicLink: () => kind === 'link' }) as unknown as Dirent
  const fs = (sizes: Record<string, number>): ListFs => ({
    readdir: async () => [
      dirent('big.iso', 'file'),
      dirent('small.txt', 'file'),
      dirent('folder', 'dir'),
      dirent('link.bin', 'link'),
      dirent('vanished.bin', 'file')
    ],
    lstat: async (p) => {
      const name = p.split('\\').pop() as string
      if (!(name in sizes)) throw new Error('ENOENT')
      return fakeStat({ size: sizes[name] })
    }
  })

  it('lists only plain files at or above the size, biggest first', async () => {
    const out = await listBigFiles('C:\\d', 100 * MB, fs({ 'big.iso': 300 * MB, 'small.txt': 10, 'link.bin': 500 * MB }))
    expect(out.map((f) => f.name)).toEqual(['big.iso'])
    expect(out[0]).toMatchObject({ kind: 'file', path: 'C:\\d\\big.iso' })
  })

  it('throws when the folder cannot be read', async () => {
    await expect(listBigFiles('C:\\d', 1, { lstat: async () => fakeStat({}), readdir: async () => Promise.reject(new Error('EPERM')) })).rejects.toThrow()
  })
})

describe('explainFilePath', () => {
  const rule = (path: string): ReturnType<typeof explainFilePath> => explainFilePath(path)

  it('knows the big Windows files by name', () => {
    expect(rule('C:\\pagefile.sys')).toMatchObject({ verdict: 'DONT_TOUCH', source: 'database', matchedId: 'pagefile' })
    expect(rule('D:\\PAGEFILE.SYS')).toMatchObject({ verdict: 'DONT_TOUCH' })
    expect(rule('C:\\swapfile.sys')).toMatchObject({ verdict: 'DONT_TOUCH' })
    const hiber = rule('C:\\hiberfil.sys')
    expect(hiber).toMatchObject({ verdict: 'CAUTION', howToClean: { command: 'powercfg /hibernate off' } })
  })

  it('only trusts a name rule where the database anchors it', () => {
    // pagefile.sys is only the real paging file at the drive root
    expect(rule('C:\\Users\\a\\Downloads\\pagefile.sys')?.matchedId).not.toBe('pagefile')
  })

  it('says what a kind of file is from its extension, and never calls a personal file safe', () => {
    for (const name of ['report.docx', 'holiday.JPG', 'film.mkv', 'song.flac', 'backup.zip', 'tax.pdf', 'app.py']) {
      const r = rule(`C:\\Users\\a\\Documents\\${name}`)
      expect(r, name).toMatchObject({ verdict: 'CAUTION', source: 'database' })
    }
    expect(rule('C:\\Users\\a\\Downloads\\setup.exe')).toMatchObject({ verdict: 'CAUTION' })
  })

  it('treats keys, certificates and password vaults as untouchable', () => {
    for (const name of ['server.pem', 'vault.kdbx', 'cert.pfx', 'id_rsa', 'NTUSER.DAT', 'ntuser.dat.LOG1', 'wallet.dat']) {
      expect(rule(`C:\\Users\\a\\${name}`), name).toMatchObject({ verdict: 'DONT_TOUCH' })
    }
  })

  it('recognises throw-away and rebuildable files', () => {
    expect(rule('C:\\Users\\a\\Downloads\\movie.mp4.crdownload')).toMatchObject({ verdict: 'SAFE' })
    expect(rule('C:\\Users\\a\\crash.dmp')).toMatchObject({ verdict: 'SAFE' })
    expect(rule('C:\\Users\\a\\Pictures\\Thumbs.db')).toMatchObject({ verdict: 'REBUILDS_AUTOMATICALLY' })
    expect(rule('C:\\Users\\a\\x\\m.pyc')).toMatchObject({ verdict: 'REBUILDS_AUTOMATICALLY' })
  })

  it('a name rule beats the extension rule: Thumbs.db is not a generic database', () => {
    expect(rule('C:\\Users\\a\\Pictures\\Thumbs.db')?.matchedId).toBe('thumbs-db')
    expect(rule('C:\\Users\\a\\data\\app.db')?.matchedId).toBe('type-database')
  })

  it('uses the folder a file is in: anything inside a cache folder follows the folder', () => {
    const r = rule('C:\\proj\\node_modules\\left-pad\\index.js')
    expect(r?.matchedId).toBe('node-modules (inside)')
    expect(r?.verdict).not.toBe('DONT_TOUCH')
    // a document in Temp is still in Temp
    expect(rule('C:\\Users\\a\\AppData\\Local\\Temp\\x.docx')?.matchedId).toMatch(/\(inside\)$/)
  })

  it('does not mistake a file for a folder of the same name', () => {
    expect(rule('C:\\Users\\a\\Documents\\Temp')).toBeNull()
    expect(rule('C:\\Users\\a\\Documents\\node_modules')).toBeNull()
  })

  it('files inside Windows and Program Files are DONT_TOUCH, even for harmless-looking types', () => {
    expect(rule('C:\\Windows\\System32\\kernel32.dll')?.verdict).toBe('DONT_TOUCH')
    expect(rule('C:\\Windows\\notes.txt')).toMatchObject({ verdict: 'DONT_TOUCH', source: 'system' })
    expect(rule('C:\\Windows\\Logs\\CBS\\CBS.log')?.verdict).toBe('DONT_TOUCH')
    expect(rule('C:\\Program Files\\App\\app.log')).toMatchObject({ verdict: 'DONT_TOUCH', source: 'system' })
    // ...except the entries written for those exact system paths
    expect(rule('C:\\Windows\\MEMORY.DMP')).toMatchObject({ verdict: 'SAFE', matchedId: 'memory-dmp' })
  })

  it('returns null for a file it cannot tell (the AI fallback takes over)', () => {
    expect(rule('C:\\Users\\a\\stuff\\mystery.xyz')).toBeNull()
    expect(rule('C:\\Users\\a\\stuff\\README')).toBeNull()
  })
})

describe('known-files database', () => {
  it('passes the same validation as the folder database', () => {
    expect(() => validateDatabase(knownFiles, 'known-files')).not.toThrow()
  })

  it('never rates a type that holds the user\'s own work as safe', () => {
    const entries = validateDatabase(knownFiles, 'known-files')
    const personal = ['type-document', 'type-image', 'type-video', 'type-audio', 'type-archive', 'type-code', 'type-outlook-data', 'type-database', 'type-vdisk']
    for (const id of personal) {
      const e = entries.find((x) => x.id === id)
      expect(e, id).toBeDefined()
      expect(['CAUTION', 'DONT_TOUCH'], id).toContain(e?.verdict)
    }
  })
})

describe('largest files in a folder scan', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'dirvo-big-'))
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))
  const put = (rel: string, bytes: number): void => {
    const full = join(root, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, Buffer.alloc(bytes))
  }

  it('keeps the five biggest files (1 MB or more), biggest first, including nested ones', async () => {
    put('a.bin', 2 * MB)
    put('sub/b.bin', 7 * MB)
    put('sub/deep/c.bin', 4 * MB)
    for (let i = 0; i < 5; i++) put(`d${i}.bin`, 3 * MB + i * 1000)
    put('tiny.txt', 10)
    const r = await scanFolder(root)
    expect(r.largestFiles).toHaveLength(5)
    expect(r.largestFiles?.map((f) => f.sizeBytes)).toEqual([...(r.largestFiles ?? [])].map((f) => f.sizeBytes).sort((a, b) => b - a))
    expect(r.largestFiles?.[0]).toMatchObject({ sizeBytes: 7 * MB, path: join(root, 'sub', 'b.bin') })
    expect(r.largestFiles?.some((f) => f.path.endsWith('tiny.txt'))).toBe(false)
    expect(r.largestFiles?.some((f) => f.sizeBytes === 2 * MB)).toBe(false) // pushed out by five bigger ones
  })

  it('leaves the field out when nothing is big enough', async () => {
    put('a.txt', 100)
    const r = await scanFolder(root)
    expect('largestFiles' in r).toBe(false)
  })
})

describe('drive scan with files', () => {
  const run = async (deps: Partial<DriveScanDeps>): Promise<DriveScanItem[]> => {
    const items: DriveScanItem[] = []
    const base: DriveScanDeps = {
      isContainer: (p) => p === 'C:\\',
      listChildDirs: async () => [],
      explain: () => null,
      scanFolder: () => ({ promise: Promise.resolve<ScanOutcome>({ status: 'error', message: 'x' }), cancel: () => {} })
    }
    const h = scanDrive('C:\\', { ...base, ...deps }, { onItem: (i) => items.push(i), onProgress: () => {} }, { minBytes: 50 * MB })
    await h.promise
    return items
  }

  it('lists big files that sit directly inside the folder it opens, with their offline ruling', async () => {
    const items = await run({
      listBigFiles: async (_p, min) => {
        expect(min).toBe(50 * MB)
        return [fileMetadata('C:\\pagefile.sys', { size: 8000 * MB, mtimeMs: 1, birthtimeMs: 1 })]
      },
      explainFile: (p) => explainFilePath(p)
    })
    expect(items).toHaveLength(1)
    expect(items[0].metadata).toMatchObject({ kind: 'file', name: 'pagefile.sys' })
    expect(items[0].explanation?.verdict).toBe('DONT_TOUCH')
  })

  it('still opens the folders when the files cannot be listed', async () => {
    const queued: string[] = []
    await run({
      listChildDirs: async () => {
        queued.push('listed')
        return []
      },
      listBigFiles: async () => Promise.reject(new Error('EPERM'))
    })
    expect(queued).toEqual(['listed'])
  })

  it('lists no files when the dependency is not given', async () => {
    expect(await run({})).toEqual([])
  })
})

describe('AI for files', () => {
  const enc: Encryptor = {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s).reverse(),
    decryptString: (b) => Buffer.from(b).reverse().toString()
  }
  const ANSWER = JSON.stringify({
    whatItIs: 'A game save.',
    createdBy: 'Some game',
    verdict: 'CAUTION',
    confidence: 'HIGH',
    consequenceIfDeleted: 'You lose your progress.'
  })
  let dir: string
  let calls: Array<{ url: string; init: RequestInit }>
  let deps: AiServiceDeps

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'dirvo-aifile-'))
    calls = []
    const stores = new Map<ProviderId, KeyStore>()
    const keyStoreFor = (id: ProviderId): KeyStore => {
      if (!stores.has(id)) stores.set(id, new KeyStore(join(dir, `${id}.bin`), enc, id))
      return stores.get(id) as KeyStore
    }
    await keyStoreFor('anthropic').save('sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789')
    deps = {
      settings: new AiSettingsStore(join(dir, 'settings.json')),
      keyStoreFor,
      cache: new AiCache(join(dir, 'cache.json')),
      usernames: () => ['jdoe'],
      fetchImpl: (async (url: string, init: RequestInit) => {
        calls.push({ url, init })
        return new Response(JSON.stringify({ content: [{ type: 'text', text: ANSWER }] }), { status: 200 })
      }) as unknown as typeof fetch
    }
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const file = (over: Partial<FolderMetadata> = {}): FolderMetadata => ({
    ...fileMetadata('C:\\Users\\jdoe\\Saved Games\\jdoe-slot1.sav', { size: 4096, mtimeMs: 1_700_000_000_000, birthtimeMs: 1_690_000_000_000 }),
    ...over
  })

  it('sends only the name, extension, path, size and dates, with the username hidden', () => {
    const p = buildFilePayload(file(), ['jdoe'])
    expect(Object.keys(p).sort()).toEqual(['createdAt', 'extension', 'fileName', 'kind', 'modifiedAt', 'path', 'sizeBytes'])
    expect(JSON.stringify(p).toLowerCase()).not.toContain('jdoe')
    expect(p).toMatchObject({ kind: 'file', extension: '.sav', sizeBytes: 4096, fileName: '<USER>-slot1.sav' })
  })

  it('asks with the file prompt, and returns a validated explanation', async () => {
    const r = await explainWithAi(file(), deps)
    expect(r).toMatchObject({ status: 'ok', cached: false })
    const body = String(calls[0].init.body)
    expect(body).toContain('File metadata')
    expect(body).toContain('mystery files')
    expect(body).not.toContain('Folder metadata')
    expect(body.toLowerCase()).not.toContain('jdoe')
  })

  it('does not share cached answers with a folder at the same path', async () => {
    await explainWithAi(file(), deps)
    await explainWithAi(meta({ path: file().path, name: 'slot1' }), deps)
    expect(calls).toHaveLength(2)
    await explainWithAi(file(), deps)
    expect(calls).toHaveLength(2) // the file answer was cached
  })

  it('keeps the file kind through validation, and rejects an unknown kind', () => {
    expect(validateMetadata(file()).kind).toBe('file')
    expect(() => validateMetadata({ ...meta(), kind: 'socket' })).toThrow()
    expect(validateMetadata(meta()).kind).toBeUndefined()
  })

  it('validates and keeps the largest files, never more than five', () => {
    const good = { path: 'C:\\a\\b.iso', sizeBytes: 5, modifiedAt: null }
    expect(validateMetadata({ ...meta(), largestFiles: [good] }).largestFiles).toEqual([good])
    expect(() => validateMetadata({ ...meta(), largestFiles: new Array(6).fill(good) })).toThrow()
    expect(() => validateMetadata({ ...meta(), largestFiles: [{ path: '', sizeBytes: 1, modifiedAt: null }] })).toThrow()
    expect(() => validateMetadata({ ...meta(), largestFiles: [{ path: 'C:\\x', sizeBytes: -1, modifiedAt: null }] })).toThrow()
  })
})

describe('saved results with files', () => {
  it('keeps a file as a file and recomputes its ruling with the file rules', () => {
    const f = fileMetadata('C:\\pagefile.sys', { size: 5000, mtimeMs: 1_700_000_000_000, birthtimeMs: 1_700_000_000_000 })
    const raw = { items: [{ metadata: f, explanation: null, scannedAt: '2025-01-01T00:00:00.000Z' }], history: {} }
    const seen: Array<[string, string | undefined]> = []
    const out = validateSavedScans(raw, (path, kind) => {
      seen.push([path, kind])
      return kind === 'file' ? explainFilePath(path) : null
    })
    expect(out.items[0].metadata.kind).toBe('file')
    expect(out.items[0].explanation).toMatchObject({ verdict: 'DONT_TOUCH', matchedId: 'pagefile' })
    expect(seen).toEqual([['C:\\pagefile.sys', 'file']])
  })

  it('treats a saved result with no kind as a folder', () => {
    const raw = { items: [{ metadata: meta(), explanation: null, scannedAt: '2025-01-01T00:00:00.000Z' }], history: {} }
    const seen: Array<string | undefined> = []
    validateSavedScans(raw, (_p, kind) => {
      seen.push(kind)
      return null
    })
    expect(seen).toEqual(['folder'])
  })

  it('keeps the largest files of a folder', () => {
    const m = { ...meta(), largestFiles: [{ path: 'C:\\a\\big.iso', sizeBytes: 9, modifiedAt: null }] }
    const out = validateSavedScans({ items: [{ metadata: m, explanation: null, scannedAt: '2025-01-01T00:00:00.000Z' }], history: {} }, () => null)
    expect(out.items[0].metadata.largestFiles).toHaveLength(1)
  })
})
