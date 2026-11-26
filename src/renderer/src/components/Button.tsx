type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const BASE =
  'inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium ' +
  'transition-[color,background-color,border-color,transform] duration-150 ease-out-soft ' +
  'active:scale-98 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100'

const VARIANT: Record<Variant, string> = {
  // Ink on paper. There is no accent colour, so the verdict colours stay the only colour.
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-hover',
  danger: 'border border-line-strong bg-surface text-bad-text hover:bg-bad-bg',
  ghost: 'px-3 text-ink-2 hover:bg-raised hover:text-ink'
}

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

export default function Button({ variant = 'secondary', className = '', type = 'button', ...rest }: Props): React.JSX.Element {
  return <button type={type} className={`${BASE} ${VARIANT[variant]} ${className}`} {...rest} />
}

/** Shared look for text inputs: same height and radius as buttons. */
export const INPUT_CLASS =
  'h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-sm outline-none ' +
  'transition-colors duration-150 ease-out-soft placeholder:text-faint focus:border-ink-3'
