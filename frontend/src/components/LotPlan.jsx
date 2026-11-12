import { useMemo } from 'react'
import { cn } from '../utils/cn'

/**
 * The lot, drawn as a lot.
 *
 * Spots come back named by row and bay ("A01"), so they are grouped back into
 * their rows and drawn as facing banks with a driving lane between them. A flat
 * grid of squares tells a driver nothing; a plan they recognise from the tarmac
 * does — and it makes "your bay is A01" mean something before they arrive.
 */

const STATUS = {
  available: {
    box: 'bg-ok/12 border-ok/35 text-ok',
    label: 'ว่าง',
  },
  reserved: {
    box: 'bg-warn/12 border-warn/35 text-warn',
    label: 'ถูกจองไว้',
  },
  occupied: {
    box: 'bg-surface-2 border-hairline text-content-subtle',
    label: 'มีรถจอด',
  },
  // Taken out of booking by an admin.
  closed: {
    box: 'bg-surface-2 border-dashed border-hairline text-content-subtle line-through',
    label: 'ปิดใช้งาน',
  },
}

const LotPlan = ({ spots = [], className }) => {
  const rows = useMemo(() => {
    const grouped = new Map()
    for (const spot of spots) {
      // "A01" -> row "A". Anything unexpected falls into its own bucket rather
      // than being dropped from the plan.
      const row = /^[A-Za-z]/.test(spot.spotNumber) ? spot.spotNumber[0].toUpperCase() : '·'
      if (!grouped.has(row)) grouped.set(row, [])
      grouped.get(row).push(spot)
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [spots])

  // Rows are drawn in pairs facing each other across a lane.
  const banks = []
  for (let i = 0; i < rows.length; i += 2) {
    banks.push(rows.slice(i, i + 2))
  }

  return (
    <div className={cn('space-y-4', className)}>
      {banks.map((bank, bankIndex) => (
        <div key={bankIndex} className="rounded-md bg-surface-2/60 p-2.5">
          {bank.map(([rowName, rowSpots], rowIndex) => (
            <div key={rowName}>
              <div className="flex items-center gap-2">
                <span className="w-4 shrink-0 font-mono text-micro font-semibold text-content-subtle">
                  {rowName}
                </span>

                <div className="flex-1 grid grid-cols-[repeat(auto-fit,minmax(2.1rem,1fr))] gap-1">
                  {rowSpots.map((spot) => {
                    const meta = STATUS[spot.status] || STATUS.occupied
                    return (
                      <div
                        key={spot.id}
                        title={`${spot.name} — ${meta.label}`}
                        className={cn(
                          'relative h-11 rounded-[3px] border-t-2 border-x border-b-0',
                          'flex items-end justify-center pb-1',
                          'font-mono text-[9px] font-medium',
                          meta.box,
                          // Bays on the lower rank are drawn mirrored, the way
                          // they face on the ground.
                          rowIndex === 1 && 'rotate-180'
                        )}
                      >
                        <span className={cn(rowIndex === 1 && 'rotate-180')}>
                          {spot.spotNumber.replace(/^[A-Za-z]/, '')}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Driving lane between the two ranks */}
              {rowIndex === 0 && bank.length > 1 && (
                <div className="my-1.5 ml-6 h-4 relative" aria-hidden="true">
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px border-t-2 border-dashed border-hairline" />
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export default LotPlan
