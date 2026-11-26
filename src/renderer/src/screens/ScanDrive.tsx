import { useEffect, useState } from 'react'
import type { DriveInfo, DriveScanOutcome } from '@shared/types'
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

/** How full a drive is, as a bar. It turns amber when the drive is nearly full. */
function DriveRow({ drive, disabled, onScan }: { drive: DriveInfo; disabled: boolean; onScan: () => void }): React.JSX.Element {
  const { totalBytes, freeBytes } = drive
  const known = totalBytes !== null && freeBytes !== null && totalBytes > 0
  const used = known ? totalBytes - freeBytes : 0
  const fraction = known ? used / totalBytes : 0

  return (
    <li className="flex items-center gap-6 rounded-lg border border-line bg-surface p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-mono text-base font-medium">{drive.path}</span>
          {known && (
            <span className="font-mono text-xs tabular-nums text-ink-3">
              {formatBytes(used)} used of {formatBytes(totalBytes)}
            </span>
          )}
        </div>
        {known ? (
          <>
            <div
              role="img"
              aria-label={`${Math.round(fraction * 100)} percent full, ${formatBytes(freeBytes)} free`}
              className="mt-3 h-2 overflow-hidden rounded-sm bg-track"
            >
              <div className={`h-full rounded-sm ${fraction >= 0.9 ? 'bg-warn-dot' : 'bg-bar'}`} style={{ width: `${Math.max(1, fraction * 100)}%` }} />
            </div>
            <p className={`mt-2 text-xs ${fraction >= 0.9 ? 'text-warn-text' : 'text-ink-3'}`}>
              <span className="font-mono tabular-nums">{formatBytes(freeBytes)}</span> free
              {fraction >= 0.9 && ' · nearly full'}
            </p>
          </>
        ) : (
          <p className="mt-2 text-xs text-ink-3">Space details are not available for this drive</p>
        )}
      </div>
      <Button variant="primary" onClick={onScan} disabled={disabled}>
        Scan drive
      </Button>
    </li>
  )
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
  const [drives, setDrives] = useState<DriveInfo[] | null>(null)
  useEffect(() => {
    void window.dirvo.listDrives().then(setDrives)
  }, [])

  const scanning = scanner.status === 'scanning'

  return (
    <div className="flex max-w-2xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-3xl font-medium">Scan a drive</h1>
        <p className="mt-2 text-ink-2">
          Find what is taking up space. Dirvo looks inside Windows, Program Files, user profiles and AppData, scans
          each folder, and rules on the big ones. Only names, sizes and dates are read.
        </p>
      </header>

      {drives === null ? (
        <p className="text-sm text-ink-3">Looking for drives…</p>
      ) : drives.length === 0 ? (
        <p className="text-sm text-ink-3">No drives found</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {drives.map((d) => (
            <DriveRow key={d.path} drive={d} disabled={scanning || folderScanBusy} onScan={() => onScan(d.path)} />
          ))}
        </ul>
      )}

      {scanner.status === 'scanning' && (
        <div className="rounded-lg border border-line bg-surface p-5" aria-live="polite">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                Scanning <span className="font-mono">{scanner.drive}</span>
              </p>
              <p className="mt-1 font-mono text-xs tabular-nums text-ink-3">
                {scanner.progress
                  ? `${formatCount(scanner.progress.foldersScanned)} folders done · ${formatBytes(scanner.progress.bytesScanned)} so far · ${formatCount(scanner.listed)} listed`
                  : 'Starting…'}
              </p>
            </div>
            <Button onClick={onCancel}>Cancel</Button>
          </div>
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-track">
            <div className="h-full w-1/3 animate-[slide_1.2s_ease-in-out_infinite] rounded-full bg-ink" />
          </div>
          <ul className="mt-3 space-y-1 font-mono text-xs text-ink-3">
            {(scanner.progress?.current ?? []).map((c) => (
              <li key={c} className="truncate">
                {shortenPath(c, 90)}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-3">
            Big drives can take several minutes. Results appear on the Results screen as they are found.
          </p>
        </div>
      )}

      {scanner.status === 'error' && (
        <div role="alert" className="flex items-start justify-between gap-4 rounded-lg border border-bad-line bg-bad-bg p-5 text-sm text-bad-ink">
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
        <div className="rounded-lg border border-line bg-surface p-5 text-sm">
          {last.outcome.status === 'done' ? (
            <>
              <p className="font-medium">
                Finished scanning <span className="font-mono">{last.drive}</span>
              </p>
              <p className="mt-1 text-ink-2">
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
              <p className="mt-1 text-ink-2">{formatCount(last.listed)} folders were listed before you stopped it.</p>
            </>
          )}
          {last.listed > 0 && (
            <Button variant="primary" onClick={onViewResults} className="mt-4">
              View results
            </Button>
          )}
        </div>
      )}

      {folderScanBusy && <p className="text-xs text-ink-3">A folder scan is running. Wait for it to finish first.</p>}
    </div>
  )
}
