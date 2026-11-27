import type { ProviderId } from './providers'

export type Verdict = 'SAFE' | 'REBUILDS_AUTOMATICALLY' | 'CAUTION' | 'DONT_TOUCH'

export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH'
export type ExplanationSource = 'system' | 'database' | 'ai'

/** Windows Settings pages Dirvo can open for the user. */
export type SettingsTarget = 'storage' | 'apps'

/**
 * Advice on cleaning a folder the safe way. Dirvo never deletes anything: this is text, a command
 * from a fixed allow-list that the user can copy and run themselves, or a Settings page to open.
 */
export interface HowToClean {
  text: string
  command?: string
  settings?: SettingsTarget
}

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
  /** Set when low AI confidence made Dirvo lower the verdict. This is what the AI originally said. */
  downgradedFrom?: Verdict
  /** Safe ways to clean it, from the known-folder database. */
  howToClean?: HowToClean
  /** Why: the AI was not confident, or its own explanation contradicted a "safe" verdict. */
  downgradeReason?: 'low-confidence' | 'contradiction'
}

export type AiExplainResult =
  | { status: 'ok'; explanation: FolderExplanation; cached: boolean }
  | { status: 'no-key' }
  | { status: 'error'; message: string }

/** What the user picked in Settings. */
export interface AiConfigInput {
  provider: ProviderId
  model: string
  /** Only used by providers whose address can be changed (Ollama, custom). */
  baseUrl: string
}

/** The current AI setup, as shown in Settings. Never includes the key itself. */
export interface AiConfig extends AiConfigInput {
  /** A key is saved for the selected provider. */
  hasKey: boolean
  /** False if Windows cannot encrypt secrets for this user. Dirvo then refuses to store a key. */
  encryptionAvailable: boolean
}

export interface ActionResult {
  ok: boolean
  message: string
}

/** One of the biggest files inside a folder, noted during the scan. */
export interface LargeFile {
  path: string
  sizeBytes: number
  modifiedAt: string | null
}

/**
 * Metadata about a folder, or about a single file when `kind` is 'file'. Collected without ever
 * reading file contents. A file is described with the same fields so it can sit in the same list: its
 * size is the file size, fileCount is 1, dirCount is 0 and its only extension is its own.
 */
export interface FolderMetadata {
  /** Missing means a folder (older saved results have no kind). */
  kind?: 'folder' | 'file'
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
  /** Folders only: up to 5 of the biggest files inside (1 MB or more), biggest first. */
  largestFiles?: LargeFile[]
}

/** Result of looking at one file. A typed path that turns out to be a folder is reported as such. */
export type FileInspectOutcome =
  | { status: 'done'; result: FolderMetadata; explanation: FolderExplanation | null }
  | { status: 'folder' }
  | { status: 'error'; message: string }

export interface ScanProgress {
  currentPath: string
  filesScanned: number
  bytesScanned: number
}

export type ScanOutcome =
  | { status: 'done'; result: FolderMetadata }
  | { status: 'cancelled' }
  | { status: 'error'; message: string }

/** A drive on this PC. Sizes are null if Windows would not report them. */
export interface DriveInfo {
  path: string
  totalBytes: number | null
  freeBytes: number | null
}

export interface DriveScanItem {
  metadata: FolderMetadata
  /** Offline answer only. Unknown folders are not sent to the AI automatically during a drive scan. */
  explanation: FolderExplanation | null
}

export interface DriveScanProgress {
  foldersScanned: number
  bytesScanned: number
  /** Folders being scanned right now. */
  current: string[]
}

export type DriveScanEvent =
  | { scanId: string; type: 'item'; item: DriveScanItem }
  | { scanId: string; type: 'progress'; progress: DriveScanProgress }

export type DriveScanOutcome =
  | {
      status: 'done'
      foldersScanned: number
      /** Folders smaller than the size threshold, scanned but not listed. */
      hiddenSmall: number
      /** Folders that could not be read at all (permissions). */
      skipped: number
      minBytes: number
    }
  | { status: 'cancelled' }
  | { status: 'error'; message: string }

/** Results and size history saved on this PC between sessions. */
export interface SavedScans {
  items: ScannedFolder[]
  /** Latest known size of every folder ever scanned, by lower-cased path. Survives "Clear list". */
  history: Record<string, SizeSnapshot>
}

export type ReportFormat = 'md' | 'csv'

export interface ReportRequest {
  content: string
  format: ReportFormat
  suggestedName: string
  /** Replace the Windows username with <USER> before writing the file. */
  redactUser: boolean
}

export type ReportResult = { status: 'saved'; path: string } | { status: 'cancelled' } | { status: 'error'; message: string }

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
  /** Opens the Windows file picker. Null if the user cancels. */
  pickFile: () => Promise<string | null>
  /** Drives that exist on this PC, with how much space is used. */
  listDrives: () => Promise<DriveInfo[]>
  /** Offline lookup: system rules, then the known-folder database. Null means unknown. */
  explainFolder: (path: string) => Promise<FolderExplanation | null>
  /**
   * Looks at one file (size and dates only, never its contents) and gives the offline answer.
   * 'folder' means the path is a folder, so the caller should scan it as one.
   */
  inspectFile: (path: string) => Promise<FileInspectOutcome>
  /** Offline answers for a few files at once, in the same order. Null means unknown. */
  explainFiles: (paths: string[]) => Promise<Array<FolderExplanation | null>>
  /** Asks where to save a report (Windows save dialog) and writes it there. */
  saveReport: (request: ReportRequest) => Promise<ReportResult>
  /** Loads the results saved last time (offline rulings are recomputed from the current database). */
  loadScans: () => Promise<SavedScans>
  /** Saves the current results and size history on this PC. Nothing is uploaded. */
  saveScans: (saved: SavedScans) => Promise<void>
  /** Deletes the saved results and size history. */
  forgetScans: () => Promise<void>
  /** Copies one of Dirvo's cleanup commands to the clipboard. Refused for anything not on the allow-list. */
  copyCommand: (command: string) => Promise<void>
  /** Opens a Windows Settings page. Only the pages in SettingsTarget are allowed. */
  openSettings: (target: SettingsTarget) => Promise<void>
  /** Asks the AI about a folder Dirvo does not know. Only sanitised metadata leaves the PC. */
  aiExplain: (metadata: FolderMetadata) => Promise<AiExplainResult>
  /** The selected AI provider, model and address, plus whether a key is saved for it. */
  getAiConfig: () => Promise<AiConfig>
  /** Saves the provider, model and (for local servers) address. */
  setAiConfig: (input: AiConfigInput) => Promise<ActionResult>
  /** The key goes to the main process and is stored encrypted, one per provider. It is never sent back. */
  saveApiKey: (provider: ProviderId, key: string) => Promise<ActionResult>
  removeApiKey: (provider: ProviderId) => Promise<ActionResult>
  /** Sends a tiny test request to the selected provider. */
  testApiKey: () => Promise<ActionResult>
  /**
   * Scans a whole drive (e.g. "C:\\"): splits it into folders, scans each, and streams results via
   * onDriveEvent. Cancel with cancelScan(scanId).
   */
  scanDrive: (scanId: string, root: string) => Promise<DriveScanOutcome>
  /**
   * "Look inside": scans the folders directly inside one folder and streams them through onDriveEvent.
   * minBytes hides tiny folders (the main process keeps it between 256 KB and 1 GB). Cancel with cancelScan.
   */
  breakdownFolder: (scanId: string, path: string, minBytes: number) => Promise<DriveScanOutcome>
  /** Returns an unsubscribe function. */
  onDriveEvent: (cb: (event: DriveScanEvent) => void) => () => void
  /** Returns an unsubscribe function. */
  onScanProgress: (cb: (scanId: string, progress: ScanProgress) => void) => () => void
}

/** 'none': nothing pending. 'loading': asking the AI. 'no-key': AI needed but no key is set up. */
export type AiStatus = 'none' | 'loading' | 'no-key' | 'error'

/** A folder's size at one point in time, kept so a later scan can show what changed. */
export interface SizeSnapshot {
  sizeBytes: number
  scannedAt: string
}

/** One result in the list: what the scanner found, plus Dirvo's answer if it has one. */
export interface ScannedFolder {
  metadata: FolderMetadata
  /** Null while unknown (offline lookup found nothing and the AI has not answered). */
  explanation: FolderExplanation | null
  aiStatus: AiStatus
  aiError?: string
  /** When this result was scanned (ISO date). */
  scannedAt: string
  /** The size from the scan before this one, if the folder was scanned before. */
  previous?: SizeSnapshot
  /** Set once the user has used "Look inside" on this folder. */
  lookedInside?: { listed: number; hiddenSmall: number; skipped: number }
}
