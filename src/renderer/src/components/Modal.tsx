import { useEffect, useRef } from 'react'

interface Props {
  /** The id of the heading inside, so screen readers announce the dialog by its title. */
  titleId: string
  onClose: () => void
  /** While busy the dialog cannot be dismissed (for example while a file is being saved). */
  busy?: boolean
  children: React.ReactNode
}

const FOCUSABLE = 'input, button:not(:disabled), select, textarea, [href], [tabindex]:not([tabindex="-1"])'

/**
 * A dialog over the window. Esc and a click outside close it, Tab stays inside it, focus starts in it,
 * and focus goes back to where it was when it closes.
 */
export default function Modal({ titleId, onClose, busy = false, children }: Props): React.JSX.Element {
  const panel = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const busyRef = useRef(busy)
  busyRef.current = busy

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const el = panel.current
    if (el && !el.contains(document.activeElement)) el.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape' && !busyRef.current) {
        ev.preventDefault()
        onCloseRef.current()
        return
      }
      if (ev.key !== 'Tab' || !panel.current) return
      const focusable = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault()
        last.focus()
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      before?.focus?.()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget && !busy) onClose()
      }}
    >
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-full w-full max-w-md overflow-y-auto rounded-lg border border-line bg-surface p-6">
        {children}
      </div>
    </div>
  )
}
