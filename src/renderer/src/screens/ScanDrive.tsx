import { useEffect, useState } from 'react'
import type { DriveScanOutcome } from '@shared/types'
import Button from '../components/Button'
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
    <div className="flex max-w-2xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-3xl font-medium">Scan a drive</h1>
        <p className="mt-2 text-zinc-600">
          Find what is taking up space. Dirvo looks inside Windows, Program Files, user profiles and AppData, scans
          each folder, and lists the big ones with an explanation. Only names, sizes and dates are read.
        </p>
      </header>

      {drives === null ? (
        <p className="text-sm text-zinc-500">Looking for drives…</p>
      ) : drives.length === 0 ? (
        <p className="text-sm text-zinc-500">No drives found</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {drives.map((d) => (
            <li key={d} className="flex h-14 items-center justify-between rounded-xl border border-zinc-200 bg-white pl-5 pr-3">
              <span className="font-mono text-sm font-medium">{d}</span>
              <Button variant="primary" onClick={() => onScan(d)} disabled={scanning || folderScanBusy}>
                Scan drive
              </Button>
            </li>
          ))}
        </ul>
      )}

      {scanner.status === 'scanning' && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5" aria-live="polite">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                Scanning <span className="font-mono">{scanner.drive}</span>
              </p>
              <p className="mt-1 text-xs tabular-nums text-zinc-500">
                {scanner.progress
                  ? `${formatCount(scanner.progress.foldersScanned)} folders done · ${formatBytes(scanner.progress.bytesScanned)} so far · ${formatCount(scanner.listed)} listed`
                  : 'Starting…'}
              </p>
            </div>
            <Button onClick={onCancel}>Cancel</Button>
          </div>
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full w-1/3 animate-[slide_1.2s_ease-in-out_infinite] rounded-full bg-indigo-600" />
          </div>
          <ul className="mt-3 space-y-1 font-mono text-xs text-zinc-500">
            {(scanner.progress?.current ?? []).map((c) => (
              <li key={c} className="truncate">
                {shortenPath(c, 90)}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-zinc-500">
            Big drives can take several minutes. Results appear on the Results screen as they are found.
          </p>
        </div>
      )}

      {scanner.status === 'error' && (
        <div role="alert" className="flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">
          <div>
            <p className="font-medium">Could not scan the drive</p>
            <p className="mt-1">{scanner.message}</p>
          </div>
          <Button variant="ghost" onClick={onDismissError}>
            Dismiss
          </Button>
        </div>
      )}

      {!scanning && last && last.outcome.status !== 'error' && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 text-sm">
          {last.outcome.status === 'done' ? (
            <>
              <p className="font-medium">
                Finished scanning <span className="font-mono">{last.drive}</span>
              </p>
              <p className="mt-1 text-zinc-600">
                {formatCount(last.listed)} folders of {formatBytes(last.outcome.minBytes)} or more are listed.{' '}
                {last.outcome.hiddenSmall > 0 && `${formatCount(last.outcome.hiddenSmall)} smaller folders were left out. `}
                {last.outcome.skipped > 0 &&
                  `${formatCount(last.outcome.skipped)} folders could not be read (permissions).`}
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">
                Scan of <span className="font-mono">{last.drive}</span> cancelled
              </p>
              <p className="mt-1 text-zinc-600">{formatCount(last.listed)} folders were listed before you stopped it.</p>
            </>
          )}
          {last.listed > 0 && (
            <Button variant="primary" onClick={onViewResults} className="mt-4">
              View results
            </Button>
          )}
        </div>
      )}

      {folderScanBusy && <p className="text-xs text-zinc-500">A folder scan is running. Wait for it to finish first.</p>}
    </div>
  )
}
