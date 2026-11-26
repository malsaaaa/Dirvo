import { useEffect, useState } from 'react'

export default function App(): React.JSX.Element {
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.dirvo.appVersion().then(setVersion)
  }, [])

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-2">
      <h1 className="text-3xl font-semibold tracking-tight">Dirvo</h1>
      <p className="text-slate-500">Mystery folders, explained.</p>
      {version && <p className="text-xs text-slate-400">v{version}</p>}
    </main>
  )
}
