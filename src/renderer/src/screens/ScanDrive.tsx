import { useEffect, useState } from 'react'
import type { DriveScanOutcome } from '@shared/types'
import type { DriveScanState } from '../hooks/useDriveScan'
import { formatBytes, formatCount, shortenPath } from '../lib/format'

interface Props {
  scanner: DriveScanState
  /** The last finished scan, for the summary line. */
  last: { drive: string; outcome: DriveScanOutcome; listed: number } | null
  /** Another scan (a folder scan) is running, so drive scanning is unavailable. */
  folderScanBusy: boolean
  onScan: (drive: string) => void
  onCancel: () => void
  onDismissError: () => void
  onViewResults: () => void
}

export default function ScanDrive({
  scanner,
  last,
  folderScanBusy,
  onScan,
  onCancel,
  onDismissError,
  onViewResults
}: Props): React.JSX.Element {
  const [drives, setDrives] = useState<string[] | null>(null)
  useEffect(() => {
    void window.dirvo.listDrives().then(setDrives)
  }, [])

  const scanning = scanner.status === 'scanning'

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Scan a drive</h1>
        <p className="mt-1 text-slate-600">
          Find what is taking up space. Dirvo looks inside Windows, Program Files, user profiles and AppData, scans
          each folder, and lists the big ones with an explanation. Only names, sizes and dates are read.
        </p>
      </header>

      {drives === null ? (
        <p className="text-sm text-slate-500">Looking for drives…</p>
      ) : drives.length === 0 ? (
        <p className="text-sm text-slate-500">No drives found.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {drives.map((d) => (
            <li key={d} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
              <span className="font-medium">{d}</span>
              <button
                onClick={() => onScan(d)}
                disabled={scanning || folderScanBusy}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Scan drive
              </button>
            </li>
          ))}
        </ul>
      )}

      {scanner.status === 'scanning' && (
        <div className="rounded-lg border border-slate-200 bg-white p-4" aria-live="polite">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Scanning {scanner.drive}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {scanner.progress
                  ? `${formatCount(scanner.progress.foldersScanned)} folders done · ${formatBytes(scanner.progress.bytesScanned)} so far · ${formatCount(scanner.listed)} listed`
                  : 'Starting…'}
              </p>
            </div>
            <button
              onClick={onCancel}
              className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-1/3 animate-[slide_1.2s_ease-in-out_infinite] rounded-full bg-indigo-500" />
          </div>
          <ul className="mt-2 space-y-0.5 text-xs text-slate-400">
            {(scanner.progress?.current ?? []).map((c) => (
              <li key={c} className="truncate">
                {shortenPath(c, 90)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            Big drives can take several minutes. Results appear on the Results screen as they are found.
          </p>
        </div>
      )}

      {scanner.status === 'error' && (
        <div role="alert" className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <div>
            <p className="font-medium">Could not scan the drive</p>
            <p className="mt-0.5 text-red-800">{scanner.message}</p>
          </div>
          <button onClick={onDismissError} className="shrink-0 rounded-md px-2 py-1 text-red-800 hover:bg-red-100">
            Dismiss
          </button>
        </div>
      )}

      {!scanning && last && last.outcome.status !== 'error' && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          {last.outcome.status === 'done' ? (
            <>
              <p className="font-medium">Finished scanning {last.drive}</p>
              <p className="mt-1 text-slate-600">
                {formatCount(last.listed)} folders of {formatBytes(last.outcome.minBytes)} or more are listed.{' '}
                {last.outcome.hiddenSmall > 0 && `${formatCount(last.outcome.hiddenSmall)} smaller folders were left out. `}
                {last.outcome.skipped > 0 &&
                  `${formatCount(last.outcome.skipped)} folders could not be read (permissions).`}
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">Scan of {last.drive} cancelled</p>
              <p className="mt-1 text-slate-600">{formatCount(last.listed)} folders were listed before you stopped it.</p>
            </>
          )}
          {last.listed > 0 && (
            <button onClick={onViewResults} className="mt-3 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
              View results
            </button>
          )}
        </div>
      )}

      {folderScanBusy && <p className="text-xs text-slate-500">A folder scan is running. Wait for it to finish first.</p>}
    </div>
  )
}
