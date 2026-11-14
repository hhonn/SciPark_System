import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight,
  QrCode,
  Wallet,
  MapPinned,
  Clock3,
  Sun,
  Moon,
  Monitor,
  ShieldCheck,
  Footprints,
  ParkingCircle,
} from 'lucide-react'
import Logo from '../components/Logo'
import CampusMap from '../components/CampusMap'
import Button from '../components/ui/Button'
import { useAuthStore } from '../stores/authStore'
import { useThemeStore } from '../stores/themeStore'
import { usePricingStore } from '../stores/pricingStore'
import { parkingAPI } from '../utils/apiService'
import { availabilityTone } from '../utils/format'
import { cn } from '../utils/cn'

// Marketing surface.
//
// Built on what the reference parking products actually do: SpotHero and
// JustPark put the product itself in the hero rather than a stock photo, then
// back it with hard numbers. So this hero shows the real, live availability of
// the five lots (the same data the app runs on) instead of describing it.
//
// This is also the one screen where motion may perform (see DESIGN.md).

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor }

const buildSteps = ({ bookingFee, freeHours, overtimeRate, graceMinutes }, maxDiscount) => [
  {
    icon: MapPinned,
    title: 'เลือกลานจอด',
    body: 'เห็นจำนวนช่องว่างจริงและระยะเดินของทุกลานก่อนออกจากบ้าน',
  },
  {
    icon: Wallet,
    title: `จ่าย ${bookingFee} บาท`,
    body: 'ระบบเลือกช่องจอดให้อัตโนมัติและล็อกไว้ทันทีที่ชำระเงินสำเร็จ',
  },
  {
    icon: QrCode,
    title: 'สแกนเข้าจอด',
    body: `สแกน QR ที่ช่องจอดภายใน ${graceMinutes} นาที เพื่อยืนยันว่ามาถึงแล้ว`,
  },
  {
    icon: Clock3,
    title: `จอดฟรี ${freeHours} ชม.`,
    body: `เกิน ${freeHours} ชั่วโมงคิดเพิ่ม ${overtimeRate} บาท/ชม. สมาชิกลดสูงสุด ${maxDiscount}%`,
  },
]

const Landing = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { theme, cycleTheme } = useThemeStore()
  const pricing = usePricingStore((s) => s.pricing)
  const tierDiscount = usePricingStore((s) => s.tierDiscount)
  const maxDiscount = Math.max(...Object.values(tierDiscount))
  const steps = buildSteps(pricing, maxDiscount)
  const reduce = useReducedMotion()

  const [zones, setZones] = useState([])
  const [loaded, setLoaded] = useState(false)

  // Public endpoint: the hero can show real numbers before anyone signs in.
  useEffect(() => {
    let cancelled = false
    parkingAPI
      .getZones()
      .then(({ data }) => {
        if (!cancelled) setZones(data.zones || [])
      })
      .catch(() => {
        // the hero degrades to its static copy if this fails
      })
      .finally(() => !cancelled && setLoaded(true))
    return () => {
      cancelled = true
    }
  }, [])

  if (isAuthenticated) return <Navigate to="/app" replace />

  const ThemeIcon = THEME_ICON[theme]
  const totalAvailable = zones.reduce((s, z) => s + (z.availableSpots || 0), 0)
  const totalSpots = zones.reduce((s, z) => s + (z.totalSpots || 0), 0)
  const nearest = [...zones]
    .filter((z) => z.availableSpots > 0)
    .sort((a, b) => (a.walkMinutes ?? 99) - (b.walkMinutes ?? 99))[0]
  // The stat band quotes live capacity rather than a number typed into the copy.
  const capacityStat = totalSpots > 0 ? String(totalSpots) : '140'

  const reveal = (delay = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 24 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: '-80px' },
          transition: { duration: 0.5, delay, ease: [0.22, 0.8, 0.29, 1] },
        }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="fixed top-0 inset-x-0 z-50 h-topbar bg-canvas/80 backdrop-blur-xl border-b border-hairline">
        <div className="app-gutter h-full flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Logo className="w-9 h-9" />
            <span className="text-h3 font-semibold tracking-tight">SciPark</span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={cycleTheme} aria-label="สลับธีม">
              <ThemeIcon className="w-5 h-5" />
            </Button>
            <Link to="/login" className="hidden sm:block">
              <Button variant="ghost" size="sm">
                เข้าสู่ระบบ
              </Button>
            </Link>
            <Link to="/register">
              <Button size="sm">สมัครฟรี</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ---------------- Hero ---------------- */}
      <section className="relative pt-topbar overflow-hidden">
        <div className="absolute inset-0 hero-grid pointer-events-none" aria-hidden="true" />
        <div
          className="absolute -top-32 left-1/2 -translate-x-1/2 w-[70rem] h-[40rem] rounded-full bg-brand-500/[0.07] blur-3xl pointer-events-none"
          aria-hidden="true"
        />

        <div className="app-gutter relative py-12 sm:py-20 grid lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-14 items-center">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 0.8, 0.29, 1] }}
          >
            {/* Live status, not a tagline badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface pl-2 pr-3.5 py-1.5 shadow-e1">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                {!reduce && (
                  <span className="absolute inline-flex h-full w-full rounded-full bg-ok opacity-60 animate-ping" />
                )}
                <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
              </span>
              <span className="text-micro font-medium text-content">
                {loaded && totalSpots > 0
                  ? `ตอนนี้ว่าง ${totalAvailable} จาก ${totalSpots} ช่อง`
                  : 'คณะวิทยาศาสตร์ สจล.'}
              </span>
            </div>

            <h1 className="mt-5 text-display font-semibold text-content text-balance">
              หยุดวนหาที่จอด
              <br />
              <span className="text-brand-500">จองไว้ล่วงหน้า</span>
            </h1>

            <p className="mt-5 text-body sm:text-lg text-content-muted max-w-xl leading-relaxed">
              SciPark บอกจำนวนช่องว่างของทุกลานจอดแบบเรียลไทม์ จ่ายค่าธรรมเนียม{' '}
              {pricing.bookingFee} บาท แล้วระบบจะล็อกช่องจอดไว้ให้ พร้อมบอกว่าเดินอีกกี่นาทีถึงคณะ
            </p>

            {nearest && (
              <p className="mt-3 text-small text-content-muted">
                ใกล้คณะที่สุดตอนนี้:{' '}
                <span className="font-medium text-content">{nearest.name}</span> — ว่าง{' '}
                <span className="font-mono text-ok tabular">{nearest.availableSpots}</span> ช่อง
                เดิน <span className="font-mono tabular">{nearest.walkMinutes}</span> นาที
              </p>
            )}

            <div className="mt-7 flex flex-col sm:flex-row gap-3">
              <Link to="/register">
                <Button size="lg" iconRight={ArrowRight} fullWidth>
                  เริ่มใช้งานฟรี
                </Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="outline" fullWidth>
                  เข้าสู่ระบบ
                </Button>
              </Link>
            </div>

            {/* Hard numbers, the way the reference sites anchor trust */}
            <dl className="mt-9 grid grid-cols-3 gap-4 sm:gap-6 max-w-lg">
              {[
                [capacityStat, 'ช่องจอด', `ใน ${zones.length || 5} ลานทั่วคณะ`],
                ['30', 'นาที', 'เวลายืนยันการมาถึง'],
                ['3', 'ชั่วโมง', 'จอดฟรีทุกการจอง'],
              ].map(([value, unit, label]) => (
                <div key={label} className="border-l-2 border-brand-500/30 pl-3.5">
                  <dt className="sr-only">{label}</dt>
                  <dd>
                    <span className="font-mono text-2xl sm:text-3xl font-semibold text-content tabular">
                      {value}
                    </span>
                    <span className="ml-1 text-small text-content-muted">{unit}</span>
                    <span className="block mt-0.5 text-micro text-content-subtle">{label}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </motion.div>

          {/* Live map: the product itself, in the hero */}
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.97, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 0.8, 0.29, 1] }}
            className="relative"
          >
            <div className="rounded-xl border border-hairline bg-surface shadow-e3 overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-hairline">
                <div className="flex items-center gap-2">
                  <ParkingCircle className="w-4 h-4 text-brand-500" aria-hidden="true" />
                  <span className="text-small font-semibold text-content">
                    ที่ว่างตอนนี้
                  </span>
                </div>
                <span className="inline-flex items-center gap-1.5 text-micro text-content-subtle">
                  <span className="w-1.5 h-1.5 rounded-full bg-ok" aria-hidden="true" />
                  อัปเดตสด
                </span>
              </div>

              {zones.length > 0 ? (
                <CampusMap zones={zones} className="rounded-none border-0" />
              ) : (
                <div className="aspect-[10/7] skeleton rounded-none" />
              )}

              {/* Three nearest lots, as a driver would scan them */}
              <ul className="divide-y divide-hairline">
                {(zones.length > 0
                  ? [...zones].sort((a, b) => (a.walkMinutes ?? 99) - (b.walkMinutes ?? 99)).slice(0, 3)
                  : []
                ).map((zone) => {
                  const tone = availabilityTone(zone.availableSpots, zone.totalSpots)
                  return (
                    <li key={zone.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span
                        className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0',
                          tone === 'ok' && 'bg-ok',
                          tone === 'warn' && 'bg-warn',
                          tone === 'risk' && 'bg-risk'
                        )}
                      >
                        {zone.code}
                      </span>
                      <span className="flex-1 min-w-0 text-small text-content truncate">
                        {zone.name}
                      </span>
                      <span className="inline-flex items-center gap-1 text-micro text-content-subtle shrink-0">
                        <Footprints className="w-3 h-3" aria-hidden="true" />
                        {zone.walkMinutes} น.
                      </span>
                      <span
                        className={cn(
                          'font-mono text-small font-semibold tabular shrink-0 w-10 text-right',
                          tone === 'ok' && 'text-ok',
                          tone === 'warn' && 'text-warn',
                          tone === 'risk' && 'text-risk'
                        )}
                      >
                        {zone.availableSpots === 0 ? 'เต็ม' : zone.availableSpots}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>

          </motion.div>
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section className="py-16 sm:py-24 border-t border-hairline">
        <div className="app-gutter">
          <motion.div {...reveal()} className="max-w-xl">
            <h2 className="text-h1 text-content">ใช้งานอย่างไร</h2>
            <p className="mt-3 text-content-muted">
              สี่ขั้นตอน ตั้งแต่เลือกลานจนขับออกจากที่จอด
            </p>
          </motion.div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <motion.div
                key={step.title}
                {...reveal(index * 0.08)}
                className="relative bg-surface border border-hairline rounded-lg p-5 overflow-hidden"
              >
                <span
                  className="absolute right-4 top-3 font-mono text-5xl font-semibold text-content/[0.06] select-none leading-none"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <span className="relative flex w-11 h-11 rounded-md bg-brand-500/10 text-brand-600 items-center justify-center">
                  <step.icon className="w-5 h-5" aria-hidden="true" />
                </span>
                <h3 className="relative mt-4 text-h3 text-content">{step.title}</h3>
                <p className="relative mt-1.5 text-small text-content-muted leading-relaxed">
                  {step.body}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Pricing ---------------- */}
      <section className="py-16 sm:py-24 border-t border-hairline bg-surface-2/50">
        <div className="app-gutter grid gap-10 lg:grid-cols-2 lg:items-center">
          <motion.div {...reveal()}>
            <h2 className="text-h1 text-content">ราคาตรงไปตรงมา</h2>
            <p className="mt-3 text-content-muted leading-relaxed">
              ค่าธรรมเนียมการจอง {pricing.bookingFee} บาทต่อครั้ง ครอบคลุมการจอด
              {pricing.freeHours} ชั่วโมงแรก หลังจากนั้นคิดเพิ่มชั่วโมงละ {pricing.overtimeRate} บาท
              ไม่มีค่าสมาชิกบังคับ
            </p>

            <div className="mt-6 flex items-start gap-3 p-4 rounded-md bg-warn/10 border border-warn/25">
              <ShieldCheck className="w-5 h-5 text-warn shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-small text-content">
                <strong className="font-semibold">ต้องเข้าจอดภายใน {pricing.graceMinutes} นาที</strong> หลังชำระเงิน
                หากไม่สแกน QR ยืนยันการมาถึง ระบบจะยกเลิกการจองอัตโนมัติและ
                <strong className="font-semibold"> ไม่คืนค่าธรรมเนียม {pricing.bookingFee} บาท</strong>
              </p>
            </div>
          </motion.div>

          <motion.div
            {...reveal(0.1)}
            className="bg-surface border border-hairline rounded-xl p-6 shadow-e2"
          >
            <ul className="divide-y divide-hairline">
              {[
                ['ค่าธรรมเนียมการจอง', `${pricing.bookingFee} บาท/ครั้ง`],
                [`${pricing.freeHours} ชั่วโมงแรก`, 'ฟรี'],
                ['ชั่วโมงถัดไป', `${pricing.overtimeRate} บาท/ชม.`],
                ['สมาชิก Diamond', `ลดค่าจอดเกิน ${tierDiscount.diamond}%`],
                ['สมาชิก Predator', `ลดค่าจอดเกิน ${tierDiscount.predator}%`],
              ].map(([label, value]) => (
                <li key={label} className="flex items-center justify-between py-3.5">
                  <span className="text-small text-content-muted">{label}</span>
                  <span className="font-mono text-small font-semibold text-content tabular">
                    {value}
                  </span>
                </li>
              ))}
            </ul>

            <Link to="/register" className="block mt-6">
              <Button fullWidth size="lg" iconRight={ArrowRight}>
                สมัครและจองเลย
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      <footer className="border-t border-hairline py-10">
        <div className="app-gutter flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Logo className="w-7 h-7" />
            <span className="text-small text-content-muted">
              SciPark ระบบจองที่จอดรถ คณะวิทยาศาสตร์ สจล.
            </span>
          </div>
          <nav className="flex items-center gap-5 text-small text-content-muted">
            <Link to="/terms" className="hover:text-content transition-colors duration-fast">
              ข้อกำหนดการใช้งาน
            </Link>
            <Link to="/privacy" className="hover:text-content transition-colors duration-fast">
              นโยบายความเป็นส่วนตัว
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}

export default Landing
