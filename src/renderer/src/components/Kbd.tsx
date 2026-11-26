/** A keycap. Shortcut text like "or" is shown as plain words between caps. */
export default function Kbd({ children }: { children: string }): React.JSX.Element {
  if (children === 'or' || children === '–') {
    return <span className="text-xs text-ink-3">{children}</span>
  }
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-line-strong bg-raised px-1.5 font-mono text-xs text-ink-2">
      {children}
    </kbd>
  )
}
