import { app, BrowserWindow, clipboard, dialog, ipcMain, safeStorage, shell } from 'electron'
import { promises as fsp } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { basename, isAbsolute, join, normalize } from 'node:path'
import { AiCache } from './ai/cache'
import { AiSettingsStore, SettingsError } from './ai/provider-settings'
import { EncryptionUnavailableError, KeyFormatError, KeyStore } from './ai/key-store'
import { explainWithAi, testApiKey } from './ai/service'
import workerPath from './scanner/worker?modulePath'
// `?asset` copies the file into the build and gives its path, in development and when packaged.
import appIcon from '../../resources/icon.ico?asset'
import { startScan } from './scanner/scanner'
import { scanDrive } from './scanner/drive-scan'
import { explainPath } from './knowledge/explain'
import { isContainerFolder } from './knowledge/system-paths'
import { isAllowedCleanCommand, isSettingsTarget, SETTINGS_URIS } from './knowledge/clean-commands'
import { isProviderId, type ProviderId } from '../shared/providers'
import type {
  ActionResult,
  AiConfig,
  AiConfigInput,
  DriveInfo,
  DriveScanEvent,
  DriveScanOutcome,
  FolderExplanation,
  ScanOutcome
} from '../shared/types'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 960,
    minHeight: 600,
    show: false,
    // Matches the dark theme, which is the default, so there is no white flash on start.
    backgroundColor: '#0e0e10',
    // Title bar and taskbar icon (replaces the default Electron icon).
    icon: appIcon,
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

/** Folder scans and drive scans, by scan id. Both can be cancelled the same way. */
const activeScans = new Map<string, { cancel: () => void }>()

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

  ipcMain.handle('drive:scan', async (e, scanId: unknown, root: unknown): Promise<DriveScanOutcome> => {
    if (typeof scanId !== 'string' || scanId.length === 0 || scanId.length > 100) {
      return { status: 'error', message: 'Invalid scan id' }
    }
    // Only whole drives: "C:" or "C:\"
    if (typeof root !== 'string' || !/^[a-zA-Z]:[\\/]?$/.test(root)) {
      return { status: 'error', message: 'Choose a drive to scan' }
    }
    if (activeScans.has(scanId)) return { status: 'error', message: 'Scan already running' }

    const driveRoot = `${root[0].toUpperCase()}:\\`
    try {
      await fsp.access(driveRoot)
    } catch {
      return { status: 'error', message: 'That drive is not available' }
    }

    const sender = e.sender
    const emit = (event: DriveScanEvent): void => {
      if (!sender.isDestroyed()) sender.send('drive:event', event)
    }
    const handle = scanDrive(
      driveRoot,
      {
        isContainer: isContainerFolder,
        explain: explainPath,
        scanFolder: (path, onProgress) => startScan(workerPath, path, onProgress),
        listChildDirs: async (path) => {
          const entries = await fsp.readdir(path, { withFileTypes: true })
          // Links and junctions are never followed (they would double count or loop).
          return entries.filter((d) => d.isDirectory() && !d.isSymbolicLink()).map((d) => join(path, d.name))
        }
      },
      {
        onItem: (item) => emit({ scanId, type: 'item', item }),
        onProgress: (progress) => emit({ scanId, type: 'progress', progress })
      }
    )
    activeScans.set(scanId, handle)
    try {
      return await handle.promise
    } finally {
      activeScans.delete(scanId)
    }
  })

  ipcMain.handle('drives:list', async (): Promise<DriveInfo[]> => {
    const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
    const found = await Promise.all(
      letters.map(async (l): Promise<DriveInfo | null> => {
        const path = `${l}:\\`
        try {
          await fsp.access(path)
        } catch {
          return null
        }
        try {
          const s = await fsp.statfs(path)
          const unit = Number(s.bsize)
          return { path, totalBytes: Number(s.blocks) * unit, freeBytes: Number(s.bavail) * unit }
        } catch {
          return { path, totalBytes: null, freeBytes: null }
        }
      })
    )
    return found.filter((d): d is DriveInfo => d !== null)
  })

  ipcMain.handle('folder:explain',(_e, path: unknown): FolderExplanation | null => {
    if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('Invalid path')
    return explainPath(path)
  })

  // --- AI fallback and settings. The API key only ever lives in this process. ---
  const userData = app.getPath('userData')
  const aiSettings = new AiSettingsStore(join(userData, 'ai-settings.json'))
  // One encrypted key file per provider. Anthropic keeps its original file name, so keys saved by
  // earlier versions still work.
  const keyStores = new Map<ProviderId, KeyStore>()
  const keyStoreFor = (id: ProviderId): KeyStore => {
    let store = keyStores.get(id)
    if (!store) {
      const file = id === 'anthropic' ? 'anthropic-key.bin' : `${id}-key.bin`
      store = new KeyStore(join(userData, file), safeStorage, id)
      keyStores.set(id, store)
    }
    return store
  }
  const aiCache = new AiCache(join(userData, 'ai-cache.json'))
  const usernames = (): string[] => {
    const names = [process.env['USERNAME'] ?? '', basename(homedir())]
    try {
      names.push(userInfo().username)
    } catch {
      // userInfo can throw on unusual accounts; the Users\<name> path rule still applies.
    }
    return names
  }

  const aiDeps = { settings: aiSettings, keyStoreFor, cache: aiCache, usernames }

  ipcMain.handle('ai:explain', (_e, metadata: unknown) => explainWithAi(metadata, aiDeps))

  ipcMain.handle('settings:getConfig', async (): Promise<AiConfig> => {
    const cfg = await aiSettings.resolve()
    const store = keyStoreFor(cfg.provider.id)
    return {
      provider: cfg.provider.id,
      model: cfg.model,
      baseUrl: cfg.baseUrl,
      hasKey: await store.hasKey(),
      encryptionAvailable: store.encryptionAvailable()
    }
  })

  ipcMain.handle('settings:setConfig', async (_e, input: unknown): Promise<ActionResult> => {
    if (typeof input !== 'object' || input === null) return { ok: false, message: 'Invalid settings' }
    try {
      await aiSettings.set(input as AiConfigInput)
      return { ok: true, message: 'Saved' }
    } catch (err) {
      return { ok: false, message: err instanceof SettingsError ? err.message : 'Could not save the settings.' }
    }
  })

  ipcMain.handle('settings:saveKey', async (_e, provider: unknown, key: unknown): Promise<ActionResult> => {
    if (!isProviderId(provider) || typeof key !== 'string') return { ok: false, message: 'Invalid key' }
    try {
      await keyStoreFor(provider).save(key)
      return { ok: true, message: 'API key saved and encrypted.' }
    } catch (err) {
      if (err instanceof KeyFormatError || err instanceof EncryptionUnavailableError) return { ok: false, message: err.message }
      return { ok: false, message: 'Could not save the key.' }
    }
  })

  ipcMain.handle('settings:removeKey', async (_e, provider: unknown): Promise<ActionResult> => {
    if (!isProviderId(provider)) return { ok: false, message: 'Invalid provider' }
    await keyStoreFor(provider).remove()
    return { ok: true, message: 'API key removed.' }
  })

  ipcMain.handle('settings:testKey', () => testApiKey(aiDeps))

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

  // Cleanup advice: Dirvo only ever copies an allow-listed command or opens a Settings page.
  // It never runs a command, and the main process re-checks everything the UI sends.
  ipcMain.handle('clipboard:copyCommand', (_e, command: unknown) => {
    if (!isAllowedCleanCommand(command)) throw new Error('That command is not allowed')
    clipboard.writeText(command)
  })

  ipcMain.handle('shell:openSettings', async (_e, target: unknown) => {
    if (!isSettingsTarget(target)) throw new Error('Unknown settings page')
    await shell.openExternal(SETTINGS_URIS[target])
  })
}

app.whenReady().then(() => {
  // Gives Dirvo its own identity in the Windows taskbar, so it shows its own icon and is not grouped with Electron.
  app.setAppUserModelId('com.dirvo.app')
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
