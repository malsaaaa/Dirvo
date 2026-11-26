import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './index.css'
import { applyTheme, getStoredTheme } from './lib/theme'

// Dark is the default. Apply a saved choice before the first paint.
applyTheme(getStoredTheme(), false)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
