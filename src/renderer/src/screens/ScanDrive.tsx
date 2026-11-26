import { useEffect, useState } from 'react'

export default function ScanDrive(): React.JSX.Element {
  const [drives, setDrives] = useState<string[] | null>(null)

  useEffect(() => {
    void window.dirvo.listDrives().then(setDrives)
  }, [])

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Scan a drive</h1>
        <p className="mt-1 text-slate-600">
          Find what is taking up space. Dirvo will go through the biggest folders on a drive and explain each one.
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
                disabled
                title="Drive scanning is coming soon"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-500 disabled:cursor-not-allowed"
              >
                Scan drive
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
        Drive scanning is coming soon. For now, pick individual folders on the Explain a folder screen.
      </p>
    </div>
  )
}
