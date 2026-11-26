import type { FolderMetadata, ScanProgress } from '../../shared/types'

export type WorkerInMessage = { type: 'start'; path: string } | { type: 'cancel' }

export type WorkerOutMessage =
  | { type: 'progress'; progress: ScanProgress }
  | { type: 'done'; result: FolderMetadata }
  | { type: 'cancelled' }
  | { type: 'error'; message: string }
