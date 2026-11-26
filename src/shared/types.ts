export type Verdict = 'SAFE' | 'REBUILDS_AUTOMATICALLY' | 'CAUTION' | 'DONT_TOUCH'

export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH'
export type ExplanationSource = 'system' | 'database' | 'ai'

/** What Dirvo tells the user about a folder. Advice only: Dirvo never deletes anything. */
export interface FolderExplanation {
  whatItIs: string
  createdBy: string
  verdict: Verdict
  confidence: Confidence
  consequenceIfDeleted: string
  source: ExplanationSource
  /** Id of the system rule or database entry that matched, when there is one. */
  matchedId?: string
}

/** Metadata about a folder. Collected without ever reading file contents. */
export interface FolderMetadata {
  path: string
  name: string
  sizeBytes: number
  fileCount: number
  dirCount: number
  /** Lower-cased extension (with dot) -> file count. "(none)" for files without one. Top 50 only. */
  extensionCounts: Record<string, number>
  /** ISO dates. Null when unknown (e.g. empty folder). */
  createdAt: string | null
  modifiedAt: string | null
  oldestFileAt: string | null
  newestFileAt: string | null
  /** Up to 30 file names, breadth-first so shallow files come first. */
  sampleFileNames: string[]
  /** Entries we could not read (permission denied, vanished mid-scan, ...). */
  unreadableCount: number
  /** Symlinks / junctions are never followed; this counts them. */
  linksSkipped: number
}

export interface ScanProgress {
  currentPath: string
  filesScanned: number
  bytesScanned: number
}

export type ScanOutcome =
  | { status: 'done'; result: FolderMetadata }
  | { status: 'cancelled' }
  | { status: 'error'; message: string }

/** The one API the renderer may use. Implemented in preload, handled in main. */
export interface DirvoApi {
  appVersion: () => Promise<string>
  openInExplorer: (path: string) => Promise<void>
  copyPath: (path: string) => Promise<void>
  /** scanId is chosen by the caller so it can cancel before the promise settles. */
  scanFolder: (scanId: string, path: string) => Promise<ScanOutcome>
  cancelScan: (scanId: string) => Promise<void>
  /** Opens the Windows folder picker. Null if the user cancels. */
  pickFolder: () => Promise<string | null>
  /** Drive roots that exist on this PC, e.g. ["C:\\", "D:\\"]. */
  listDrives: () => Promise<string[]>
  /** Offline lookup: system rules, then the known-folder database. Null means unknown. */
  explainFolder: (path: string) => Promise<FolderExplanation | null>
  /** Returns an unsubscribe function. */
  onScanProgress: (cb: (scanId: string, progress: ScanProgress) => void) => () => void
}
