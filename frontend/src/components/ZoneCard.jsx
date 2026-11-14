import { Link } from 'react-router-dom'
import { Footprints, ChevronRight, ShieldCheck } from 'lucide-react'
import { cn } from '../utils/cn'
import { availabilityTone } from '../utils/format'

// A parking lot, as a driver reads it.
//
// The count of free bays is the single thing the decision turns on, so it is
// the largest element on the card. The previous version buried it in a badge
// and gave the most space to a description nobody chooses a car park by.
// Walking time sits beside it because it is the usual tie-breaker.

const TONE = {
  ok: {
    number: 'text-ok',
    bar: 'bg-ok',
    rail: 'bg-ok/15',
    chip: 'bg-ok/10 text-ok border-ok/25',
    edge: 'before:bg-ok',
  },
  warn: {
    number: 'text-warn',
    bar: 'bg-warn',
    rail: 'bg-warn/15',
    chip: 'bg-warn/10 text-warn border-warn/25',
    edge: 'before:bg-warn',
  },
  risk: {
    number: 'text-risk',
    bar: 'bg-risk',
    rail: 'bg-risk/15',
    chip: 'bg-risk/10 text-risk border-risk/25',
    edge: 'before:bg-risk',
  },
}

// Ten segments read as "how many bays", where a smooth bar reads as a percentage.
const SEGMENTS = 10

const ZoneCard = ({ zone, className }) => {
  const tone = availabilityTone(zone.availableSpots, zone.totalSpots)
  const isFull = zone.isFull || zone.availableSpots === 0
  const filled = Math.round((zone.availableSpots / Math.max(1, zone.totalSpots)) * SEGMENTS)
  const t = TONE[tone]

  return (
    <Link
      to={`/app/parking/${zone.id}`}
      className={cn(
        'group relative block overflow-hidden rounded-lg border border-hairline bg-surface',
        // A coloured spine carries the status even before the numbers are read.
        'before:absolute before:left-0 before:inset-y-0 before:w-1',
        t.edge,
        'transition-[box-shadow,border-color,transform] duration-base ease-out',
        'hover:shadow-e2 hover:border-brand-500/40',
        isFull && 'opacity-75',
        className
      )}
    >
      <div className="pl-5 pr-4 py-4">
        <div className="flex items-start gap-4">
          {/* The number, doing the work */}
          <div className="shrink-0 text-center w-16">
            <div className={cn('font-mono text-4xl font-semibold leading-none tabular', t.number)}>
              {isFull ? '0' : zone.availableSpots}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wide text-content-subtle">
              {isFull ? 'เต็ม' : 'ว่าง'}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-h3 text-content truncate">{zone.name}</h3>
                <p className="mt-0.5 flex items-center gap-3 text-small text-content-muted">
                  <span className="font-mono text-content-subtle">{zone.zoneName}</span>
                  <span className="inline-flex items-center gap-1">
                    <Footprints className="w-3.5 h-3.5" aria-hidden="true" />
                    เดิน {zone.walkMinutes ?? '-'} นาที
                  </span>
                </p>
              </div>

              <ChevronRight
                className="w-5 h-5 text-content-subtle shrink-0 mt-1 transition-transform duration-fast group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </div>

            {/* Segmented availability meter */}
            <div className="mt-3 flex items-center gap-2">
              <div className="flex gap-[3px] flex-1" aria-hidden="true">
                {Array.from({ length: SEGMENTS }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'h-1.5 flex-1 rounded-full transition-colors duration-slow',
                      i < filled ? t.bar : t.rail
                    )}
                  />
                ))}
              </div>
              <span className="font-mono text-micro text-content-subtle tabular shrink-0">
                /{zone.totalSpots}
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-micro font-medium',
                  t.chip
                )}
              >
                {isFull ? 'ไม่มีที่ว่าง' : `พร้อมจอง ${zone.availableSpots} ช่อง`}
              </span>
              <span className="inline-flex items-center gap-1 text-micro text-content-subtle">
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                CCTV ตลอด 24 ชม.
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

export default ZoneCard
