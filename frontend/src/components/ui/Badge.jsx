import { cn } from '../../utils/cn'

/**
 * Status pill.
 *
 * Every tone pairs colour with a text label and, for status tones, a dot.
 * Colour alone is not a signal — roughly 8% of men cannot separate the red and
 * green states, and those two carry the most important meanings in this app.
 */
const TONES = {
  neutral: 'bg-surface-2 text-content-muted border-hairline',
  brand: 'bg-brand-500/10 text-brand-600 border-brand-500/20',
  ok: 'bg-ok/12 text-ok border-ok/25',
  warn: 'bg-warn/12 text-warn border-warn/25',
  risk: 'bg-risk/12 text-risk border-risk/25',
}

const DOT = {
  neutral: 'bg-content-subtle',
  brand: 'bg-brand-500',
  ok: 'bg-ok',
  warn: 'bg-warn',
  risk: 'bg-risk',
}

export const Badge = ({ tone = 'neutral', dot = false, icon: Icon, className, children, ...props }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 border rounded-full px-2.5 py-1 text-micro font-semibold whitespace-nowrap',
      TONES[tone],
      className
    )}
    {...props}
  >
    {dot && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', DOT[tone])} aria-hidden="true" />}
    {Icon && <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
    {children}
  </span>
)

export default Badge
