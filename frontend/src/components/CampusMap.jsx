import { useId } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Footprints } from 'lucide-react'
import { cn } from '../utils/cn'
import { availabilityTone } from '../utils/format'

/**
 * Schematic map of the faculty's parking lots.
 *
 * Every serious parking product — SpotHero, JustPark, Parkopedia — leads with a
 * map, because "where is it and how far do I then walk" is the question a text
 * list cannot answer. This is a hand-drawn schematic rather than a tile service:
 * the campus is five lots around one building, so a real map would need an API
 * key, cost money per load, and show far more city than anyone needs.
 *
 * Pin positions come from the zone documents (mapX/mapY as percentages), so the
 * map and the data can never drift apart.
 */

const TONE_CLASS = {
  ok: { fill: 'fill-ok', text: 'text-ok', ring: 'stroke-ok' },
  warn: { fill: 'fill-warn', text: 'text-warn', ring: 'stroke-warn' },
  risk: { fill: 'fill-risk', text: 'text-risk', ring: 'stroke-risk' },
}

const CampusMap = ({ zones = [], selectedId, onSelect, className }) => {
  const gradientId = useId()
  const reduce = useReducedMotion()

  return (
    <div
      className={cn(
        // The pins below are placed with percentage offsets against this box,
        // so it must keep the drawing's 10:7 ratio. Capping its height instead
        // cropped the SVG and left the pins sitting away from their lots.
        'relative w-full aspect-[10/7] overflow-hidden rounded-lg border border-hairline bg-surface-2',
        className
      )}
    >
      {/* Ground plan */}
      <svg
        viewBox="0 0 100 70"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 w-full h-full block"
        role="presentation"
      >
        <defs>
          <pattern id={`grass-${gradientId}`} width="4" height="4" patternUnits="userSpaceOnUse">
            <rect width="4" height="4" className="fill-ok/[0.06]" />
            <circle cx="2" cy="2" r="0.35" className="fill-ok/20" />
          </pattern>
        </defs>

        {/* Greenery */}
        <rect width="100" height="70" fill={`url(#grass-${gradientId})`} />

        {/* Roads — drawn first so buildings and lots sit on top */}
        <g className="stroke-ink-300/50 dark:stroke-ink-700" strokeLinecap="round" fill="none">
          <path d="M0 50 H100" strokeWidth="5" />
          <path d="M0 22 H100" strokeWidth="3.5" />
          <path d="M14 0 V70" strokeWidth="3.5" />
          <path d="M86 0 V70" strokeWidth="3.5" />
        </g>
        <g
          className="stroke-surface"
          strokeWidth="0.35"
          strokeDasharray="2 2"
          fill="none"
          opacity="0.8"
        >
          <path d="M0 50 H100" />
          <path d="M0 22 H100" />
        </g>

        {/* Faculty building — the destination every walk time is measured to.
            It sits in the middle with the lots around it, and no other label is
            drawn nearby: a pin landing on top of a building name made both
            unreadable. */}
        <g>
          <rect
            x="36"
            y="29"
            width="28"
            height="14"
            rx="1.5"
            className="fill-brand-500/15 stroke-brand-500/40"
            strokeWidth="0.5"
          />
          <text
            x="50"
            y="35.4"
            textAnchor="middle"
            className="fill-brand-600 font-semibold"
            style={{ fontSize: '3px' }}
          >
            คณะวิทยาศาสตร์
          </text>
          <text
            x="50"
            y="39.4"
            textAnchor="middle"
            className="fill-brand-600/70"
            style={{ fontSize: '2.2px' }}
          >
            จุดหมายปลายทาง
          </text>
        </g>

        {/* Parking lots, drawn behind the pins */}
        {zones.map((zone) => {
          const tone = availabilityTone(zone.availableSpots, zone.totalSpots)
          const x = ((zone.mapX ?? 50) / 100) * 100
          const y = ((zone.mapY ?? 50) / 100) * 70

          return (
            <g key={`lot-${zone.id}`}>
              <rect
                x={x - 8}
                y={y - 5}
                width="16"
                height="10"
                rx="1"
                className={cn('transition-[fill-opacity] duration-base', TONE_CLASS[tone].fill)}
                // `fill-opacity-*` is not a Tailwind utility, so the class pair
                // that used to sit here compiled to nothing; this attribute was
                // doing the work on its own all along.
                fillOpacity={selectedId === zone.id ? 0.28 : 0.12}
              />
              {/* Bay markings, so a lot reads as a car park */}
              <g className={TONE_CLASS[tone].ring} strokeWidth="0.25" opacity="0.5">
                {[-6, -3, 0, 3, 6].map((offset) => (
                  <line
                    key={offset}
                    x1={x + offset}
                    y1={y - 5}
                    x2={x + offset}
                    y2={y + 5}
                  />
                ))}
              </g>
            </g>
          )
        })}
      </svg>

      {/* Interactive pins live in HTML, not SVG: real buttons get focus rings,
          hit targets and screen-reader semantics for free. */}
      {zones.map((zone, index) => {
        const tone = availabilityTone(zone.availableSpots, zone.totalSpots)
        const isSelected = selectedId === zone.id
        const isFull = zone.isFull || zone.availableSpots === 0

        return (
          <motion.button
            key={zone.id}
            type="button"
            onClick={() => onSelect?.(zone)}
            initial={reduce ? false : { opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: reduce ? 0 : 0.05 * index, type: 'spring', stiffness: 400, damping: 22 }}
            style={{ left: `${zone.mapX ?? 50}%`, top: `${zone.mapY ?? 50}%` }}
            className={cn(
              'absolute -translate-x-1/2 -translate-y-1/2 z-10',
              'flex items-center gap-1.5 rounded-full border pl-1 pr-2.5 py-1',
              // Elevation + colour on hover, never scale: DESIGN.md rules that
              // out on buttons because it reads as jitter on touch. It also
              // fought the mount animation below, which drives `transform`
              // itself — the two took turns owning the same property.
              'bg-surface shadow-e2 transition-[box-shadow,border-color] duration-fast',
              'hover:shadow-e3 hover:border-brand-500/50',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
              isSelected ? 'border-brand-500 ring-2 ring-brand-500/25' : 'border-hairline',
              isFull && 'opacity-70'
            )}
            aria-label={`${zone.name} ว่าง ${zone.availableSpots} จาก ${zone.totalSpots} ช่อง เดิน ${zone.walkMinutes} นาที`}
            aria-pressed={isSelected}
          >
            <span
              className={cn(
                'flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white shrink-0',
                tone === 'ok' && 'bg-ok',
                tone === 'warn' && 'bg-warn',
                tone === 'risk' && 'bg-risk'
              )}
            >
              {zone.code || zone.zoneName?.charAt(0)}
            </span>
            <span className="font-mono text-[11px] font-semibold text-content tabular leading-none">
              {isFull ? 'เต็ม' : zone.availableSpots}
            </span>
          </motion.button>
        )
      })}

      {/* Walk-time legend */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-surface/90 backdrop-blur px-2.5 py-1 border border-hairline">
        <Footprints className="w-3 h-3 text-content-subtle" aria-hidden="true" />
        <span className="text-[10px] text-content-muted">แตะหมุดเพื่อดูลานจอด</span>
      </div>
    </div>
  )
}

export default CampusMap
