type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const BASE =
  'inline-flex h-9 shrink-0 items-center justify-center rounded-lg px-4 text-sm font-medium ' +
  'transition-[color,background-color,border-color,transform] duration-150 ease-out-soft ' +
  'active:scale-98 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100'

const VARIANT: Record<Variant, string> = {
  // The one accent in the chrome: the primary action.
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
  secondary: 'border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50',
  danger: 'border border-zinc-200 bg-white text-red-700 hover:bg-red-50',
  ghost: 'px-3 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
}

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

export default function Button({ variant = 'secondary', className = '', type = 'button', ...rest }: Props): React.JSX.Element {
  return <button type={type} className={`${BASE} ${VARIANT[variant]} ${className}`} {...rest} />
}

/** Shared look for text inputs: same height and radius as buttons. */
export const INPUT_CLASS =
  'h-9 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none ' +
  'transition-colors duration-150 ease-out-soft placeholder:text-zinc-400 focus:border-indigo-600'
