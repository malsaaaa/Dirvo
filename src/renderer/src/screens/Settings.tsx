import { useCallback, useEffect, useState } from 'react'
import { getProvider, hostOf, isLoopbackUrl, PROVIDERS, type ProviderId } from '@shared/providers'
import type { ActionResult, AiConfig } from '@shared/types'
import Button, { INPUT_CLASS } from '../components/Button'
import { applyTheme, getStoredTheme, type Theme } from '../lib/theme'

interface Props {
  /** Called after the provider or a key changes, so folders that were waiting can be re-explained. */
  onAiChanged: () => void
}

const LABEL = 'text-sm font-medium text-ink-2'
const CARD = 'rounded-xl border border-line bg-surface p-5'

export default function Settings({ onAiChanged }: Props): React.JSX.Element {
  const [cfg, setCfg] = useState<AiConfig | null>(null)
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ActionResult | null>(null)
  const [theme, setTheme] = useState<Theme>(getStoredTheme)

  const refresh = useCallback(async () => {
    const c = await window.dirvo.getAiConfig()
    setCfg(c)
    setModel(c.model)
    setBaseUrl(c.baseUrl)
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])

  const provider = cfg ? getProvider(cfg.provider) : undefined

  /** Runs a settings action, shows its message, and refreshes. `notify` tells the app to retry waiting folders. */
  const run = async (action: () => Promise<ActionResult>, opts: { refresh?: boolean; notify?: boolean; clearKey?: boolean } = {}): Promise<void> => {
    setBusy(true)
    setResult(null)
    try {
      const r = await action()
      setResult(r)
      if (r.ok && opts.clearKey) setKey('')
      if (opts.refresh) await refresh()
      if (r.ok && opts.notify) onAiChanged()
    } finally {
      setBusy(false)
    }
  }

  const changeProvider = (id: ProviderId): void => {
    // Empty model and address mean "use what is saved for this provider, or its defaults".
    void run(() => window.dirvo.setAiConfig({ provider: id, model: '', baseUrl: '' }), { refresh: true, notify: true })
  }

  const dirty =
    cfg !== null &&
    provider !== undefined &&
    (model.trim() !== cfg.model || (provider.baseUrlEditable && baseUrl.trim() !== cfg.baseUrl))

  const loopback = cfg ? isLoopbackUrl(cfg.baseUrl) : false
  const destination = cfg ? hostOf(cfg.baseUrl) : ''
  const needsKey = provider !== undefined && provider.keyMode !== 'none'

  return (
    <div className="flex max-w-2xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-3xl font-medium">Settings</h1>
        <p className="mt-2 text-ink-2">
          Folders Dirvo does not know are explained by an AI model. Pick a provider and use your own key, or run a model
          on this PC.
        </p>
      </header>

      {cfg && provider && (
        <section className={CARD}>
          <h2 className="text-base font-medium">AI provider</h2>

          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="provider" className={LABEL}>
                Provider
              </label>
              <select
                id="provider"
                value={cfg.provider}
                disabled={busy}
                onChange={(ev) => changeProvider(ev.target.value as ProviderId)}
                className={`${INPUT_CLASS} w-full flex-none`}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="model" className={LABEL}>
                Model
              </label>
              <input
                id="model"
                value={model}
                onChange={(ev) => setModel(ev.target.value)}
                spellCheck={false}
                autoComplete="off"
                className={`${INPUT_CLASS} w-full flex-none font-mono`}
              />
              <p className="text-xs text-ink-3">Model names change often. If a test fails with &ldquo;not found&rdquo;, check the provider&apos;s current names.</p>
            </div>

            {provider.baseUrlEditable && (
              <div className="flex flex-col gap-2">
                <label htmlFor="baseUrl" className={LABEL}>
                  Address
                </label>
                <input
                  id="baseUrl"
                  value={baseUrl}
                  onChange={(ev) => setBaseUrl(ev.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                  className={`${INPUT_CLASS} w-full flex-none font-mono`}
                />
                <p className="text-xs text-ink-3">Plain http:// is only allowed for localhost.</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="primary"
                disabled={busy || !dirty}
                onClick={() =>
                  void run(() => window.dirvo.setAiConfig({ provider: cfg.provider, model, baseUrl }), { refresh: true, notify: true })
                }
              >
                Save
              </Button>
              <Button disabled={busy || dirty} onClick={() => void run(() => window.dirvo.testApiKey())}>
                Test connection
              </Button>
            </div>
          </div>
        </section>
      )}

      {cfg && provider && needsKey && (
        <section className={CARD}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium">
              {provider.label} API key{provider.keyMode === 'optional' && <span className="font-normal text-ink-3"> (optional)</span>}
            </h2>
            <span className={`inline-flex items-center gap-2 text-xs font-medium ${cfg.hasKey ? 'text-ok-text' : 'text-ink-3'}`}>
              <span className={`h-2 w-2 rounded-full ${cfg.hasKey ? 'bg-ok-dot' : 'bg-faint'}`} />
              {cfg.hasKey ? 'Key saved' : 'No key'}
            </span>
          </div>

          {!cfg.encryptionAvailable && (
            <p role="alert" className="mt-4 rounded-lg bg-bad-bg px-4 py-3 text-sm text-bad-ink">
              Windows encryption is not available for this account, so Dirvo cannot store a key safely and will not
              save one.
            </p>
          )}

          <form
            className="mt-4 flex gap-2"
            onSubmit={(ev) => {
              ev.preventDefault()
              if (key.trim()) void run(() => window.dirvo.saveApiKey(cfg.provider, key), { refresh: true, notify: true, clearKey: true })
            }}
          >
            <input
              type="password"
              value={key}
              onChange={(ev) => setKey(ev.target.value)}
              placeholder={cfg.hasKey ? 'Paste a new key to replace the saved one' : provider.keyPlaceholder}
              aria-label={`${provider.label} API key`}
              autoComplete="off"
              spellCheck={false}
              className={INPUT_CLASS}
            />
            <Button type="submit" variant="primary" disabled={busy || !key.trim() || !cfg.encryptionAvailable}>
              Save key
            </Button>
          </form>

          {cfg.hasKey && (
            <div className="mt-4">
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => void run(() => window.dirvo.removeApiKey(cfg.provider), { refresh: true, notify: true })}
              >
                Remove key
              </Button>
            </div>
          )}
        </section>
      )}

      {result && (
        <p role="status" className={`-mt-2 text-sm ${result.ok ? 'text-ok-text' : 'text-bad-text'}`}>
          {result.message}
        </p>
      )}

      <section className={CARD}>
        <h2 className="text-base font-medium">Appearance</h2>
        <div role="radiogroup" aria-label="Theme" className="mt-4 flex gap-2">
          {(['dark', 'light'] as const).map((t) => (
            <Button
              key={t}
              role="radio"
              aria-checked={theme === t}
              variant={theme === t ? 'primary' : 'secondary'}
              onClick={() => {
                setTheme(t)
                applyTheme(t)
              }}
            >
              {t === 'dark' ? 'Dark' : 'Light'}
            </Button>
          ))}
        </div>
      </section>

      <section className={`${CARD} text-sm text-ink-2`}>
        <h2 className="text-base font-medium text-ink">What leaves your PC</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>
            Only for folders Dirvo does not recognise: the folder name and path, size, file and folder counts, file
            type counts, dates, and up to 30 sample file names.
          </li>
          <li>
            {loopback ? (
              <>
                Nothing leaves your PC with this setup: requests go to <span className="font-mono text-xs">{destination}</span>, which is
                this computer.
              </>
            ) : (
              <>
                That information is sent to {provider?.label ?? 'your provider'} (
                <span className="font-mono text-xs">{destination}</span>), under that service&apos;s own terms and privacy policy.
              </>
            )}
          </li>
          <li>
            Your Windows username is replaced with <code className="rounded bg-raised px-1 font-mono text-xs">&lt;USER&gt;</code> first.
          </li>
          <li>File contents are never read or sent.</li>
          {needsKey && (
            <li>
              Each key is stored encrypted with Windows (tied to this account) and is only used by Dirvo&apos;s background
              process. It is never shown again.
            </li>
          )}
          <li>Answers are cached on this PC, so the same folder is not sent twice.</li>
        </ul>
      </section>
    </div>
  )
}
