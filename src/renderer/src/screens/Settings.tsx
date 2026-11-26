import { useCallback, useEffect, useState } from 'react'
import type { ActionResult, KeyStatus } from '@shared/types'

interface Props {
  /** Called after the key is saved or removed so waiting folders can be re-explained. */
  onKeyChanged: () => void
}

export default function Settings({ onKeyChanged }: Props): React.JSX.Element {
  const [status, setStatus] = useState<KeyStatus | null>(null)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ActionResult | null>(null)

  const refresh = useCallback(async () => setStatus(await window.dirvo.getKeyStatus()), [])
  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = async (action: () => Promise<ActionResult>, changesKey: boolean): Promise<void> => {
    setBusy(true)
    setResult(null)
    try {
      const r = await action()
      setResult(r)
      if (changesKey && r.ok) {
        setKey('')
        await refresh()
        onKeyChanged()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-slate-600">
          Folders Dirvo does not know are explained by Claude, using your own Anthropic API key.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Anthropic API key</h2>
          {status && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                status.hasKey ? 'bg-emerald-100 text-emerald-800 ring-emerald-200' : 'bg-slate-100 text-slate-700 ring-slate-200'
              }`}
            >
              {status.hasKey ? 'Key saved' : 'No key'}
            </span>
          )}
        </div>

        {status && !status.encryptionAvailable && (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">
            Windows encryption is not available for this account, so Dirvo cannot store a key safely and will not
            save one.
          </p>
        )}

        <form
          className="mt-4 flex gap-2"
          onSubmit={(ev) => {
            ev.preventDefault()
            if (key.trim()) void run(() => window.dirvo.saveApiKey(key), true)
          }}
        >
          <input
            type="password"
            value={key}
            onChange={(ev) => setKey(ev.target.value)}
            placeholder={status?.hasKey ? 'Paste a new key to replace the saved one' : 'sk-ant-…'}
            aria-label="Anthropic API key"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
          <button
            type="submit"
            disabled={busy || !key.trim() || (status !== null && !status.encryptionAvailable)}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save
          </button>
        </form>

        {status?.hasKey && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => void run(() => window.dirvo.testApiKey(), false)}
              disabled={busy}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Test connection
            </button>
            <button
              onClick={() => void run(() => window.dirvo.removeApiKey(), true)}
              disabled={busy}
              className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Remove key
            </button>
          </div>
        )}

        {result && (
          <p
            role="status"
            className={`mt-3 text-sm ${result.ok ? 'text-emerald-700' : 'text-red-700'}`}
          >
            {result.message}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
        <h2 className="font-semibold text-slate-900">What leaves your PC</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Only for folders Dirvo does not recognise: the folder name and path, size, file and folder counts, file
            type counts, dates, and up to 30 sample file names.
          </li>
          <li>
            Your Windows username is replaced with <code className="rounded bg-slate-100 px-1">&lt;USER&gt;</code> first.
          </li>
          <li>File contents are never read or sent.</li>
          <li>
            Your key is stored encrypted with Windows (tied to this account) and is only used by Dirvo&apos;s background
            process. It is never shown again.
          </li>
          <li>Answers are cached on this PC, so the same folder is not sent twice.</li>
        </ul>
      </section>
    </div>
  )
}
