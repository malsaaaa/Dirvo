import { contextBridge, ipcRenderer } from 'electron'
import type { DirvoApi, ScanProgress } from '../shared/types'

const api: DirvoApi = {
  appVersion: () => ipcRenderer.invoke('app:version'),
  openInExplorer: (path) => ipcRenderer.invoke('shell:openInExplorer', path),
  copyPath: (path) => ipcRenderer.invoke('clipboard:copyPath', path),
  scanFolder: (scanId, path) => ipcRenderer.invoke('scan:start', scanId, path),
  cancelScan: (scanId) => ipcRenderer.invoke('scan:cancel', scanId),
  explainFolder: (path) => ipcRenderer.invoke('folder:explain', path),
  onScanProgress: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, scanId: string, progress: ScanProgress): void =>
      cb(scanId, progress)
    ipcRenderer.on('scan:progress', listener)
    return () => ipcRenderer.removeListener('scan:progress', listener)
  }
}

contextBridge.exposeInMainWorld('dirvo', api)
