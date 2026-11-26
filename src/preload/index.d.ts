import type { DirvoApi } from '../shared/types'

declare global {
  interface Window {
    dirvo: DirvoApi
  }
}
