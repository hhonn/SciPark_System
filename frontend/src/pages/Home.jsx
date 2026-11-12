import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  RefreshCw,
  MapPin,
  Ticket,
  AlertCircle,
  ChevronRight,
  Clock3,
  Footprints,
  ArrowUpDown,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import { SkeletonCard } from '../components/ui/Loading'
import CampusMap from '../components/CampusMap'
import ZoneCard from '../components/ZoneCard'
import { parkingAPI, bookingAPI } from '../utils/apiService'
import { apiErrorMessage } from '../utils/api'
import { useAuthStore } from '../stores/authStore'
import { useBookingStore } from '../stores/bookingStore'
import { formatCountdown } from '../utils/format'
import { cn } from '../utils/cn'

const REFRESH_INTERVAL = 30_000

const SORTS = [
  { id: 'walk', label: 'ใกล้ที่สุด' },
  { id: 'free', label: 'ว่างมากสุด' },
]

const Home = () => {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { activeBooking, setActiveBooking, clearActiveBooking } = useBookingStore()

  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [sort, setSort] = useState('walk')
  const [highlighted, setHighlighted] = useState(null)

  const loadZones = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true)
    try {
      const { data } = await parkingAPI.getZones()
      setZones(data.zones || [])
      setError(null)
    } catch (err) {
      setError(apiErrorMessage(err, 'โหลดข้อมูลลานจอดไม่สำเร็จ'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // The server is the authority on whether a booking is still live.
  const loadActiveBooking = useCallback(async () => {
    try {
      const { data } = await bookingAPI.getActiveBooking()
      setActiveBooking(data.data)
    } catch (err) {
      if (err.response?.status === 404) clearActiveBooking()
    }
  }, [setActiveBooking, clearActiveBooking])

  useEffect(() => {
    loadZones()
    loadActiveBooking()
  }, [loadZones, loadActiveBooking])

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') {
        loadZones({ silent: true })
        loadActiveBooking()
      }
    }
    const id = window.setInterval(tick, REFRESH_INTERVAL)
    return () => window.clearInterval(id)
  }, [loadZones, loadActiveBooking])

  const sorted = useMemo(() => {
    const list = [...zones]
    // Full lots sink to the bottom whichever sort is active: they are never the
    // answer to "where do I park".
    return list.sort((a, b) => {
      const aFull = a.availableSpots === 0
      const bFull = b.availableSpots === 0
      if (aFull !== bFull) return aFull ? 1 : -1
      if (sort === 'free') return b.availableSpots - a.availableSpots
      return (a.walkMinutes ?? 99) - (b.walkMinutes ?? 99)
    })
  }, [zones, sort])

  const totalAvailable = zones.reduce((sum, z) => sum + (z.availableSpots || 0), 0)
  const totalSpots = zones.reduce((sum, z) => sum + (z.totalSpots || 0), 0)
  const best = sorted[0]

  const handleRefresh = () => {
    loadZones({ silent: true })
    loadActiveBooking()
    toast.success('อัปเดตข้อมูลแล้ว')
  }

  return (
    <div className="space-y-6">
      {/* Active booking sits above everything while it exists. */}
      {activeBooking && (
        <motion.button
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => navigate('/app/booking')}
          className={cn(
            'w-full text-left rounded-lg border p-4 sm:p-5',
            'transition-[box-shadow,border-color] duration-base hover:shadow-e2',
            activeBooking.status === 'pending'
              ? 'bg-warn/8 border-warn/30'
              : 'bg-ok/8 border-ok/30'
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <span
                className={cn(
                  'w-10 h-10 rounded-md flex items-center justify-center shrink-0',
                  activeBooking.status === 'pending' ? 'bg-warn/15 text-warn' : 'bg-ok/15 text-ok'
                )}
              >
                {activeBooking.status === 'pending' ? (
                  <Clock3 className="w-5 h-5" />
                ) : (
                  <Ticket className="w-5 h-5" />
                )}
              </span>

              <div className="min-w-0">
                <p className="text-small font-semibold text-content">
                  {activeBooking.status === 'pending' ? 'รอยืนยันการมาถึง' : 'กำลังจอดอยู่'}
                </p>
                <p className="text-small text-content-muted truncate">
                  ช่อง{' '}
                  <span className="font-mono font-semibold text-content">
                    {activeBooking.spot?.spotNumber}
                  </span>{' '}
                  ลาน {activeBooking.zone?.name}
                </p>
                {activeBooking.status === 'pending' && activeBooking.timeRemainingToCheckIn && (
                  <p className="mt-1 font-mono text-small font-semibold text-warn tabular">
                    เหลือ {formatCountdown(activeBooking.timeRemainingToCheckIn.totalMs)}
                  </p>
                )}
              </div>
            </div>

            <span className="inline-flex items-center gap-1 text-small font-semibold text-content shrink-0">
              {activeBooking.status === 'pending' ? 'ดู QR เช็คอิน' : 'ดูการจอง'}
              <ChevronRight className="w-4 h-4" />
            </span>
          </div>
        </motion.button>
      )}

      {/* Headline: the live number, not a greeting. */}
      <header>
        {/* Refresh rides on the greeting line: on a phone it was wrapping onto
            a line of its own and pushing the map below the fold. */}
        <div className="flex items-center justify-between gap-4">
          <p className="text-small text-content-muted truncate">
            สวัสดี {user?.name?.split(' ')[0] || ''}
          </p>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            icon={RefreshCw}
            aria-label="รีเฟรชข้อมูลที่ว่าง"
            className={cn('shrink-0 -mr-2', refreshing && '[&>svg]:animate-spin')}
          >
            <span className="hidden sm:inline">รีเฟรช</span>
          </Button>
        </div>

        <h1 className="mt-0.5 text-h1 text-content">
          {loading ? (
            'กำลังตรวจสอบที่ว่าง...'
          ) : totalAvailable === 0 ? (
            'ตอนนี้ที่จอดเต็มทุกลาน'
          ) : (
            <>
              ตอนนี้ว่าง{' '}
              <span className="font-mono text-ok tabular">{totalAvailable}</span>{' '}
              <span className="text-content-muted text-h2">/ {totalSpots} ช่อง</span>
            </>
          )}
        </h1>

        {!loading && best && best.availableSpots > 0 && (
          <p className="mt-2 text-small text-content-muted">
            แนะนำ <span className="font-medium text-content">{best.name}</span> — ว่าง{' '}
            <span className="font-mono tabular">{best.availableSpots}</span> ช่อง เดิน{' '}
            <span className="font-mono tabular">{best.walkMinutes}</span> นาที
          </p>
        )}
      </header>

      {/* Map */}
      {!loading && !error && zones.length > 0 && (
        <section aria-label="แผนที่ลานจอด">
          <CampusMap
            zones={zones}
            selectedId={highlighted}
            onSelect={(zone) => {
              setHighlighted(zone.id)
              document
                .getElementById(`zone-${zone.id}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }}
          />
        </section>
      )}

      {/* Zone list */}
      <section>
        <div className="flex items-center justify-between gap-4 mb-3">
          <h2 className="text-h2 text-content">ลานจอดทั้งหมด</h2>

          <div
            className="flex items-center gap-1 rounded-md bg-surface-2 p-1"
            role="group"
            aria-label="เรียงลำดับ"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-content-subtle ml-1.5" aria-hidden="true" />
            {SORTS.map((option) => (
              <button
                key={option.id}
                onClick={() => setSort(option.id)}
                aria-pressed={sort === option.id}
                className={cn(
                  'px-2.5 h-7 rounded-sm text-micro font-medium transition-colors duration-fast',
                  sort === option.id
                    ? 'bg-surface text-content shadow-e1'
                    : 'text-content-muted hover:text-content'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon={AlertCircle}
            title="โหลดข้อมูลไม่สำเร็จ"
            description={error}
            action={
              <Button onClick={() => loadZones()} icon={RefreshCw}>
                ลองอีกครั้ง
              </Button>
            }
          />
        ) : zones.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="ยังไม่มีลานจอดในระบบ"
            description="ผู้ดูแลระบบยังไม่ได้เพิ่มข้อมูลลานจอด"
          />
        ) : (
          <div className="space-y-3">
            {sorted.map((zone, index) => (
              <motion.div
                key={zone.id}
                id={`zone-${zone.id}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.2) }}
              >
                <ZoneCard
                  zone={zone}
                  className={cn(
                    highlighted === zone.id && 'ring-2 ring-brand-500/30 border-brand-500/40'
                  )}
                />
              </motion.div>
            ))}
          </div>
        )}
      </section>

      <p className="flex items-center justify-center gap-1.5 text-micro text-content-subtle">
        <Footprints className="w-3.5 h-3.5" aria-hidden="true" />
        เวลาเดินคำนวณจากประตูคณะวิทยาศาสตร์
      </p>
    </div>
  )
}

export default Home
