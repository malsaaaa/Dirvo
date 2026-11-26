export type Theme = 'dark' | 'light'

export const DEFAULT_THEME: Theme = 'dark'
const STORAGE_KEY = 'dirvo-theme'

/** Anything that is not exactly "light" or "dark" (missing, corrupted, old value) falls back to dark. */
export function resolveTheme(stored: string | null | undefined): Theme {
  return stored === 'light' || stored === 'dark' ? stored : DEFAULT_THEME
}

export function getStoredTheme(): Theme {
  try {
    return resolveTheme(localStorage.getItem(STORAGE_KEY))
  } catch {
    return DEFAULT_THEME
  }
}

/** Switches the whole UI by toggling the "dark" class that the theme tokens in index.css hang off. */
export function applyTheme(theme: Theme, persist = true): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  if (!persist) return
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Storage can be unavailable; the theme still applies for this session.
  }
}
