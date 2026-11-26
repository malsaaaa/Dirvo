/** A short message at the bottom of the window, for feedback on actions done with the keyboard. */
export default function Toast({ message }: { message: string | null }): React.JSX.Element | null {
  if (!message) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-sm shadow-lg"
    >
      {message}
    </div>
  )
}
