import { contextBridge, ipcRenderer } from 'electron'
import type { DirvoApi, DriveScanEvent, ScanProgress } from '../shared/types'

const api: DirvoApi = {
  appVersion: () => ipcRenderer.invoke('app:version'),
  openInExplorer: (path) => ipcRenderer.invoke('shell:openInExplorer', path),
  copyPath: (path) => ipcRenderer.invoke('clipboard:copyPath', path),
  scanFolder: (scanId, path) => ipcRenderer.invoke('scan:start', scanId, path),
  cancelScan: (scanId) => ipcRenderer.invoke('scan:cancel', scanId),
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  listDrives: () => ipcRenderer.invoke('drives:list'),
  explainFolder:(path) => ipcRenderer.invoke('folder:explain', path),
  aiExplain: (metadata) => ipcRenderer.invoke('ai:explain', metadata),
  getKeyStatus: () => ipcRenderer.invoke('settings:keyStatus'),
  saveApiKey: (key) => ipcRenderer.invoke('settings:saveKey', key),
  removeApiKey: () => ipcRenderer.invoke('settings:removeKey'),
  testApiKey: () => ipcRenderer.invoke('settings:testKey'),
  scanDrive: (scanId, root) => ipcRenderer.invoke('drive:scan', scanId, root),
  onDriveEvent: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, event: DriveScanEvent): void => cb(event)
    ipcRenderer.on('drive:event', listener)
    return () => ipcRenderer.removeListener('drive:event', listener)
  },
  onScanProgress: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, scanId: string, progress: ScanProgress): void =>
      cb(scanId, progress)
    ipcRenderer.on('scan:progress', listener)
    return () => ipcRenderer.removeListener('scan:progress', listener)
  }
}

contextBridge.exposeInMainWorld('dirvo', api)
