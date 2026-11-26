/**
 * The Dirvo mark: a folder with the four-colour ruling bar. The folder takes the surrounding text
 * colour so it works on both themes; the bar keeps the verdict colours. Same shapes as
 * resources/mark.svg.
 */
export default function Logo({ size = 20, className = '' }: { size?: number; className?: string }): React.JSX.Element {
  return (
    <svg
      viewBox="40 60 176 136"
      width={size}
      height={(size * 136) / 176}
      className={className}
      aria-hidden
      focusable="false"
    >
      <rect x="44" y="64" width="76" height="40" rx="12" fill="currentColor" />
      <rect x="44" y="82" width="168" height="110" rx="14" fill="currentColor" />
      <rect x="64" y="148" width="29" height="18" rx="4" className="fill-ok-dot" />
      <rect x="97" y="148" width="29" height="18" rx="4" className="fill-info-dot" />
      <rect x="130" y="148" width="29" height="18" rx="4" className="fill-warn-dot" />
      <rect x="163" y="148" width="29" height="18" rx="4" className="fill-bad-dot" />
    </svg>
  )
}
