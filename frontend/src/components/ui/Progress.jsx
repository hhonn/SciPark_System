import { cn } from '../../utils/cn'

/**
 * Availability meter.
 *
 * `tone` is derived from how full a zone is, so the bar carries the same
 * meaning as the badge beside it.
 */
const TONES = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  risk: 'bg-risk',
  brand: 'bg-brand-500',
}

const Progress = ({ value, max = 100, tone = 'brand', className, label }) => {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0

  return (
    <div
      className={cn('h-2 w-full rounded-full bg-surface-2 overflow-hidden', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-slow ease-out', TONES[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export default Progress
