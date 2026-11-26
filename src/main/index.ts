import { app, BrowserWindow, clipboard, dialog, ipcMain, safeStorage, shell } from 'electron'
import { promises as fsp } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { basename, isAbsolute, join, normalize } from 'node:path'
import { AiCache } from './ai/cache'
import { EncryptionUnavailableError, KeyFormatError, KeyStore } from './ai/key-store'
import { explainWithAi, testApiKey } from './ai/service'
import workerPath from './scanner/worker?modulePath'
import { startScan, type ScanHandle } from './scanner/scanner'
import { explainPath } from './knowledge/explain'
import type { ActionResult, FolderExplanation, KeyStatus, ScanOutcome } from '../shared/types'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    show: false,
    backgroundColor: '#f8fafc',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())

  // Never navigate the app window away, and never open new windows.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const activeScans = new Map<string, ScanHandle>()

function registerIpc(): void {
  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.handle('scan:start', async (e, scanId: unknown, path: unknown): Promise<ScanOutcome> => {
    if (typeof scanId !== 'string' || scanId.length === 0 || scanId.length > 100) {
      return { status: 'error', message: 'Invalid scan id' }
    }
    if (typeof path !== 'string' || !isAbsolute(path)) {
      return { status: 'error', message: 'Please choose a full folder path' }
    }
    if (activeScans.has(scanId)) return { status: 'error', message: 'Scan already running' }

    const sender = e.sender
    // Pasted paths may use "/" or have a trailing slash; the folder picker always gives "\".
    const handle = startScan(workerPath, normalize(path), (progress) => {
      if (!sender.isDestroyed()) sender.send('scan:progress', scanId, progress)
    })
    activeScans.set(scanId, handle)
    try {
      return await handle.promise
    } finally {
      activeScans.delete(scanId)
    }
  })

  ipcMain.handle('dialog:pickFolder', async (e): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const options = { title: 'Choose a folder to explain', properties: ['openDirectory' as const] }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  ipcMain.handle('drives:list', async (): Promise<string[]> => {
    const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
    const found = await Promise.all(
      letters.map((l) =>
        fsp.access(`${l}:\\`).then(
          () => `${l}:\\`,
          () => null
        )
      )
    )
    return found.filter((d): d is string => d !== null)
  })

  ipcMain.handle('folder:explain',(_e, path: unknown): FolderExplanation | null => {
    if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('Invalid path')
    return explainPath(path)
  })

  // --- AI fallback and settings. The API key only ever lives in this process. ---
  const keyStore = new KeyStore(join(app.getPath('userData'), 'anthropic-key.bin'), safeStorage)
  const aiCache = new AiCache(join(app.getPath('userData'), 'ai-cache.json'))
  const usernames = (): string[] => {
    const names = [process.env['USERNAME'] ?? '', basename(homedir())]
    try {
      names.push(userInfo().username)
    } catch {
      // userInfo can throw on unusual accounts; the Users\<name> path rule still applies.
    }
    return names
  }

  ipcMain.handle('ai:explain', (_e, metadata: unknown) => explainWithAi(metadata, { keyStore, cache: aiCache, usernames }))

  ipcMain.handle(
    'settings:keyStatus',
    async (): Promise<KeyStatus> => ({
      hasKey: await keyStore.hasKey(),
      encryptionAvailable: keyStore.encryptionAvailable()
    })
  )

  ipcMain.handle('settings:saveKey', async (_e, key: unknown): Promise<ActionResult> => {
    if (typeof key !== 'string') return { ok: false, message: 'Invalid key' }
    try {
      await keyStore.save(key)
      return { ok: true, message: 'API key saved and encrypted.' }
    } catch (err) {
      if (err instanceof KeyFormatError || err instanceof EncryptionUnavailableError) return { ok: false, message: err.message }
      return { ok: false, message: 'Could not save the key.' }
    }
  })

  ipcMain.handle('settings:removeKey', async (): Promise<ActionResult> => {
    await keyStore.remove()
    return { ok: true, message: 'API key removed.' }
  })

  ipcMain.handle('settings:testKey', () => testApiKey({ keyStore }))

  ipcMain.handle('scan:cancel', (_e, scanId: unknown) => {
    if (typeof scanId === 'string') activeScans.get(scanId)?.cancel()
  })

  ipcMain.handle('shell:openInExplorer', (_e, path: unknown) => {
    if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('Invalid path')
    shell.showItemInFolder(path)
  })

  ipcMain.handle('clipboard:copyPath', (_e, path: unknown) => {
    if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('Invalid path')
    clipboard.writeText(path)
  })
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  for (const scan of activeScans.values()) scan.cancel()
  app.quit()
})
