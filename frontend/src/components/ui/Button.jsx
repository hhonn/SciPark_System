import { forwardRef } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../utils/cn'

/**
 * Button variants map 1:1 to DESIGN.md.
 *
 * Hover raises elevation and deepens colour; it never scales. On a touch
 * screen a scaling button reads as the layout wobbling under your thumb.
 */
const VARIANTS = {
  solid: 'bg-brand-500 text-white hover:bg-brand-600 shadow-e1 hover:shadow-e2 disabled:hover:bg-brand-500',
  soft: 'bg-brand-500/10 text-brand-600 hover:bg-brand-500/16',
  outline: 'border border-hairline bg-surface text-content hover:bg-surface-2',
  ghost: 'text-content-muted hover:bg-surface-2 hover:text-content',
  danger: 'bg-risk text-white hover:brightness-95 shadow-e1',
  'danger-soft': 'bg-risk/10 text-risk hover:bg-risk/16',
}

const SIZES = {
  // 44px is the smallest target that stays comfortable one-handed.
  sm: 'h-9 px-3 text-small gap-1.5 rounded-sm',
  md: 'h-11 px-4 text-body gap-2 rounded-md',
  lg: 'h-13 px-6 text-body gap-2.5 rounded-md',
  icon: 'h-11 w-11 rounded-md',
}

const Button = forwardRef(function Button(
  {
    variant = 'solid',
    size = 'md',
    loading = false,
    icon: Icon,
    iconRight: IconRight,
    fullWidth = false,
    className,
    children,
    disabled,
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center font-semibold select-none',
        'transition-[background-color,box-shadow,color,border-color] duration-fast ease-out',
        'disabled:opacity-55 disabled:cursor-not-allowed disabled:shadow-none',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-[18px] h-[18px] animate-spin" aria-hidden="true" />
      ) : (
        Icon && <Icon className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
      )}
      {children}
      {IconRight && !loading && <IconRight className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />}
    </button>
  )
})

export default Button
