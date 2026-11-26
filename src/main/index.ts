import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { promises as fsp } from 'node:fs'
import { isAbsolute, join, normalize } from 'node:path'
import workerPath from './scanner/worker?modulePath'
import { startScan, type ScanHandle } from './scanner/scanner'
import { explainPath } from './knowledge/explain'
import type { FolderExplanation, ScanOutcome } from '../shared/types'

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

  ipcMain.handle('scan:cancel',(_e, scanId: unknown) => {
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
