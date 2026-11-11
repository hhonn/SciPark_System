import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
  QrCode,
  MapPin,
  Car,
  Clock3,
  LogOut,
  XCircle,
  Ticket,
  CheckCircle2,
  RefreshCw,
  Wallet,
  LocateFixed,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import { PageLoader } from '../components/ui/Loading'
import { bookingAPI } from '../utils/apiService'
import { apiErrorMessage } from '../utils/api'
import { useBookingStore } from '../stores/bookingStore'
import { usePricing } from '../stores/pricingStore'
import { formatCountdown, formatDuration, formatTHB, formatTime } from '../utils/format'
import { cn } from '../utils/cn'
import { getPosition, geolocationErrorMessage } from '../utils/geolocation'

const POLL_INTERVAL = 20_000
// While the QR is on screen a staff member may scan it at any moment.
const SCAN_POLL_INTERVAL = 4_000
const URGENT_MS = 5 * 60 * 1000

const ActiveBooking = () => {
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const { activeBooking, setActiveBooking, clearActiveBooking } = useBookingStore()
  const { bookingFee, freeHours } = usePricing()

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [qrImage, setQrImage] = useState(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const [remainingMs, setRemainingMs] = useState(0)
  const expiredNotified = useRef(false)

  const load = useCallback(async () => {
    try {
      const { data } = await bookingAPI.getActiveBooking()
      setActiveBooking(data.data)
    } catch (error) {
      if (error.response?.status === 404) clearActiveBooking()
      else toast.error(apiErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [setActiveBooking, clearActiveBooking])

  useEffect(() => {
    load()
  }, [load])

  // Keep the server's view authoritative while this screen is open, and check
  // more often while the QR is up so a staff scan shows within seconds.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, qrOpen ? SCAN_POLL_INTERVAL : POLL_INTERVAL)
    return () => window.clearInterval(id)
  }, [load, qrOpen])

  // A staff scan happens on someone else's phone; notice it here.
  const wasPending = useRef(false)
  useEffect(() => {
    if (wasPending.current && activeBooking?.status === 'confirmed') {
      setQrOpen(false)
      toast.success('เช็คอินสำเร็จ เริ่มนับเวลาจอดแล้ว')
    }
    wasPending.current = activeBooking?.status === 'pending'
  }, [activeBooking?.status])

  const deadline = activeBooking?.checkInDeadline
    ? new Date(activeBooking.checkInDeadline).getTime()
    : null
  const isPending = activeBooking?.status === 'pending'

  /**
   * Countdown driven off the deadline timestamp rather than by decrementing a
   * counter: a decrementing timer drifts badly whenever a phone sleeps or the
   * tab is backgrounded, and this one is deciding whether 20 baht is lost.
   */
  useEffect(() => {
    if (!isPending || !deadline) {
      setRemainingMs(0)
      return undefined
    }

    const tick = () => {
      const left = deadline - Date.now()
      setRemainingMs(Math.max(0, left))

      if (left <= 0 && !expiredNotified.current) {
        expiredNotified.current = true
        toast.error('หมดเวลาเช็คอิน การจองถูกยกเลิกอัตโนมัติ')
        load()
      }
    }

    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [isPending, deadline, load])

  useEffect(() => {
    expiredNotified.current = false
  }, [activeBooking?.bookingId])

  const openQr = async () => {
    setBusy(true)
    try {
      // Re-issuing rotates the credential server-side, so the code on screen is
      // always the only one that works.
      const { data } = await bookingAPI.getQRCode(activeBooking.bookingId)
      setQrImage(data.data.qrCodeURL)
      setQrOpen(true)
    } catch (error) {
      toast.error(apiErrorMessage(error, 'สร้าง QR ไม่สำเร็จ'))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Self check-in, proven by where the phone is. The server decides whether
   * that is inside the lot; this only gathers the fix.
   */
  const handleGpsCheckIn = async () => {
    let position
    try {
      position = await getPosition()
    } catch (error) {
      toast.error(geolocationErrorMessage(error))
      return
    }

    setBusy(true)
    try {
      await bookingAPI.checkIn(activeBooking.bookingId, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      })
      setQrOpen(false)
      toast.success('เช็คอินสำเร็จ เริ่มนับเวลาจอดแล้ว')
      await load()
    } catch (error) {
      toast.error(apiErrorMessage(error, 'เช็คอินไม่สำเร็จ'))
      if (error.response?.data?.code === 'checkin_expired') {
        clearActiveBooking()
        navigate('/app')
      }
    } finally {
      setBusy(false)
    }
  }

  const handleCheckOut = async () => {
    setBusy(true)
    try {
      const { data } = await bookingAPI.checkOut(activeBooking.bookingId)
      setReceipt(data.data)
      clearActiveBooking()
    } catch (error) {
      // Test Case 11: an unsettled payment keeps the session open.
      toast.error(apiErrorMessage(error, 'เช็คเอาต์ไม่สำเร็จ'))
    } finally {
      setBusy(false)
    }
  }

  const handleCancel = async () => {
    setBusy(true)
    try {
      const { data } = await bookingAPI.cancelBooking(activeBooking.bookingId)
      setCancelOpen(false)
      clearActiveBooking()
      toast.success(data.message)
      navigate('/app')
    } catch (error) {
      toast.error(apiErrorMessage(error, 'ยกเลิกไม่สำเร็จ'))
    } finally {
      setBusy(false)
    }
  }

  const countdownTone = useMemo(() => {
    if (!isPending) return 'ok'
    if (remainingMs <= 0) return 'risk'
    if (remainingMs <= URGENT_MS) return 'warn'
    return 'brand'
  }, [isPending, remainingMs])

  if (loading) return <PageLoader label="กำลังโหลดการจอง..." />

  // ---- Receipt (shown right after check-out) ----
  if (receipt) {
    return (
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md mx-auto"
      >
        <div className="bg-surface border border-hairline rounded-xl shadow-e2 overflow-hidden">
          <div className="p-6 text-center border-b border-hairline">
            <span className="inline-flex w-14 h-14 rounded-full bg-ok/12 text-ok items-center justify-center mb-3">
              <CheckCircle2 className="w-7 h-7" />
            </span>
            <h1 className="text-h1 text-content">เช็คเอาต์สำเร็จ</h1>
            <p className="mt-1 text-small text-content-muted">ขอบคุณที่ใช้บริการ SciPark</p>
          </div>

          <dl className="p-6 divide-y divide-hairline">
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-small text-content-muted">เวลาที่จอด</dt>
              <dd className="font-mono text-small text-content tabular">
                {formatDuration(receipt.duration || {})}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-small text-content-muted">ค่าธรรมเนียมการจอง</dt>
              <dd className="font-mono text-small text-content tabular">
                {formatTHB(receipt.pricing?.bookingFee)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-small text-content-muted">
                ค่าจอดเกิน ({receipt.pricing?.chargeableHours || 0} ชม.)
              </dt>
              <dd className="font-mono text-small text-content tabular">
                {formatTHB(receipt.pricing?.finalCost)}
              </dd>
            </div>
            {Number(receipt.pricing?.discountAmount) > 0 && (
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-small text-ok">
                  ส่วนลดสมาชิก {receipt.pricing?.membershipDiscount}
                </dt>
                <dd className="font-mono text-small text-ok tabular">
                  −{formatTHB(receipt.pricing.discountAmount)}
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between pt-4">
              <dt className="text-h3 text-content">รวมทั้งหมด</dt>
              <dd className="font-mono text-h2 font-semibold text-content tabular">
                {formatTHB(receipt.pricing?.totalCost)}
              </dd>
            </div>
          </dl>

          {receipt.pointsEarned > 0 && (
            <div className="mx-6 mb-6 p-3 rounded-md bg-brand-500/8 border border-brand-500/20 text-center">
              <p className="text-small text-content">
                ได้รับ{' '}
                <span className="font-mono font-semibold tabular">{receipt.pointsEarned}</span> แต้ม
                · รวม{' '}
                <span className="font-mono font-semibold tabular">{receipt.totalPoints}</span> แต้ม
              </p>
            </div>
          )}

          <div className="px-6 pb-6">
            <Button fullWidth size="lg" onClick={() => navigate('/app')}>
              กลับหน้าหลัก
            </Button>
          </div>
        </div>
      </motion.div>
    )
  }

  // ---- No active booking ----
  if (!activeBooking) {
    return (
      <EmptyState
        icon={Ticket}
        title="ยังไม่มีการจองที่ใช้งานอยู่"
        description={`เลือกลานจอดเพื่อจองที่จอดรถ ค่าธรรมเนียม ${bookingFee} บาท จอดฟรี ${freeHours} ชั่วโมงแรก`}
        action={
          <Link to="/app">
            <Button size="lg">เลือกลานจอด</Button>
          </Link>
        }
      />
    )
  }

  const { spot, zone, vehicle, pricing } = activeBooking

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-h1 text-content">การจองของฉัน</h1>
        <Button variant="ghost" size="icon" onClick={load} aria-label="รีเฟรช">
          <RefreshCw className="w-5 h-5" />
        </Button>
      </header>

      {/* Status + countdown: the single most important block on this screen. */}
      <section
        className={cn(
          'rounded-xl border p-6 text-center',
          isPending ? 'bg-warn/6 border-warn/30' : 'bg-ok/6 border-ok/30'
        )}
      >
        <Badge tone={isPending ? 'warn' : 'ok'} dot className="mb-4">
          {isPending ? 'รอยืนยันการมาถึง' : 'กำลังจอดอยู่'}
        </Badge>

        {isPending ? (
          <>
            <p className="text-small text-content-muted">เหลือเวลาเช็คอิน</p>
            <p
              className={cn(
                'mt-1 font-mono text-5xl sm:text-6xl font-semibold tabular',
                countdownTone === 'risk' && 'text-risk',
                countdownTone === 'warn' && 'text-warn',
                countdownTone === 'brand' && 'text-content'
              )}
            >
              {formatCountdown(remainingMs)}
            </p>
            <p
              className={cn(
                'mt-3 text-small',
                remainingMs <= URGENT_MS ? 'text-warn font-medium' : 'text-content-muted'
              )}
            >
              {remainingMs <= 0
                ? 'หมดเวลาแล้ว ระบบกำลังยกเลิกการจอง'
                : activeBooking.checkInOptions?.gps
                  ? 'ถึงลานแล้ว ให้เจ้าหน้าที่สแกน QR หรือเช็คอินด้วยตำแหน่ง'
                  : 'ถึงลานแล้ว ให้เจ้าหน้าที่สแกน QR เพื่อเช็คอิน'}
            </p>
          </>
        ) : (
          <>
            <p className="text-small text-content-muted">จอดมาแล้ว</p>
            <p className="mt-1 font-mono text-5xl sm:text-6xl font-semibold text-content tabular">
              {activeBooking.duration?.hours || 0}
              <span className="text-2xl text-content-muted">ชม.</span>{' '}
              {String(activeBooking.duration?.minutes || 0).padStart(2, '0')}
              <span className="text-2xl text-content-muted">น.</span>
            </p>
            <p className="mt-3 text-small text-content-muted">
              เช็คอินเมื่อ {formatTime(activeBooking.actualStartTime)}
            </p>
          </>
        )}
      </section>

      {/* Spot card */}
      <section className="bg-surface border border-hairline rounded-lg p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-micro text-content-subtle">ช่องจอดของคุณ</p>
            <p className="font-mono text-4xl font-semibold text-brand-600 tabular mt-0.5">
              {spot?.spotNumber}
            </p>
          </div>
          <span className="w-12 h-12 rounded-md bg-brand-500/10 text-brand-600 flex items-center justify-center shrink-0">
            <MapPin className="w-6 h-6" />
          </span>
        </div>

        <dl className="mt-4 divide-y divide-hairline">
          <div className="flex items-center justify-between py-2.5">
            <dt className="text-small text-content-muted">ลานจอด</dt>
            <dd className="text-small text-content text-right">{zone?.name}</dd>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <dt className="text-small text-content-muted">อาคาร</dt>
            <dd className="text-small text-content text-right">{zone?.building}</dd>
          </div>
          {vehicle && (
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-small text-content-muted flex items-center gap-1.5">
                <Car className="w-4 h-4" />
                ยานพาหนะ
              </dt>
              <dd className="font-mono text-small text-content text-right">
                {vehicle.licensePlate}
              </dd>
            </div>
          )}
        </dl>

        {spot?.facilities?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {spot.facilities.map((facility) => (
              <Badge key={facility} tone="neutral">
                {facility}
              </Badge>
            ))}
          </div>
        )}
      </section>

      {/* Running cost */}
      <section className="bg-surface border border-hairline rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="w-4 h-4 text-content-subtle" />
          <h2 className="text-h3 text-content">ค่าใช้จ่าย</h2>
        </div>

        <dl className="divide-y divide-hairline">
          <div className="flex items-center justify-between py-2.5">
            <dt className="text-small text-content-muted">ค่าธรรมเนียมการจอง (ชำระแล้ว)</dt>
            <dd className="font-mono text-small text-content tabular">
              {formatTHB(pricing?.bookingFee)}
            </dd>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <dt className="text-small text-content-muted">
              ค่าจอดเกินเวลา ({pricing?.chargeableHours || 0} ชม.)
            </dt>
            <dd className="font-mono text-small text-content tabular">
              {formatTHB(pricing?.estimatedOvertimeCost)}
            </dd>
          </div>
          {pricing?.discount > 0 && (
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-small text-ok">ส่วนลด {pricing.tierName}</dt>
              <dd className="font-mono text-small text-ok tabular">−{pricing.discount}%</dd>
            </div>
          )}
          <div className="flex items-center justify-between pt-3">
            <dt className="text-small font-semibold text-content">ยอดรวมโดยประมาณ</dt>
            <dd className="font-mono text-h2 font-semibold text-content tabular">
              {formatTHB(pricing?.estimatedTotalCost)}
            </dd>
          </div>
        </dl>

        <p className="mt-3 text-micro text-content-subtle">
          จอดฟรี {pricing?.freeHours} ชั่วโมงแรก หลังจากนั้น {pricing?.overtimeRate} บาท/ชม.
          (คิดเป็นชั่วโมง)
        </p>
      </section>

      {/* Actions */}
      <div className="space-y-3">
        {isPending ? (
          <>
            <Button
              size="lg"
              fullWidth
              icon={QrCode}
              onClick={openQr}
              loading={busy}
              disabled={remainingMs <= 0}
              className={cn(remainingMs > 0 && remainingMs <= URGENT_MS && 'animate-pulse-ring')}
            >
              เปิด QR Code เช็คอิน
            </Button>
            <Button
              variant="danger-soft"
              fullWidth
              icon={XCircle}
              onClick={() => setCancelOpen(true)}
              disabled={busy}
            >
              ยกเลิกการจอง
            </Button>
          </>
        ) : (
          <Button size="lg" fullWidth icon={LogOut} onClick={handleCheckOut} loading={busy}>
            เช็คเอาต์และชำระเงิน
          </Button>
        )}
      </div>

      {/* ---- QR modal ---- */}
      <Modal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        title="QR Code เช็คอิน"
        description={`ช่อง ${spot?.spotNumber} · ${zone?.name}`}
        footer={
          activeBooking.checkInOptions?.gps ? (
            <Button fullWidth size="lg" variant="soft" icon={LocateFixed} onClick={handleGpsCheckIn} loading={busy}>
              เช็คอินด้วยตำแหน่ง (GPS)
            </Button>
          ) : null
        }
      >
        <div className="text-center">
          {qrImage ? (
            <img
              src={qrImage}
              alt={`QR Code สำหรับเช็คอินช่อง ${spot?.spotNumber}`}
              className="w-56 h-56 mx-auto rounded-md border border-hairline bg-white p-2"
            />
          ) : (
            <div className="w-56 h-56 mx-auto skeleton rounded-md" />
          )}

          <p className="mt-4 text-small text-content-muted">
            แสดง QR นี้ให้เจ้าหน้าที่ที่ลานจอดสแกน หน้านี้จะอัปเดตเองเมื่อเช็คอินสำเร็จ
          </p>
          {activeBooking.checkInOptions?.gps && (
            <p className="mt-1 text-small text-content-muted">
              หรือถ้าอยู่ในลานแล้ว (ภายใน {activeBooking.checkInOptions.radiusMeters} ม.) กดเช็คอินด้วยตำแหน่งได้
            </p>
          )}

          <p className="mt-2 inline-flex items-center gap-1.5 font-mono text-small font-semibold text-warn tabular">
            <Clock3 className="w-4 h-4" />
            เหลือ {formatCountdown(remainingMs)}
          </p>
        </div>
      </Modal>

      {/* ---- Cancel confirmation ---- */}
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="ยกเลิกการจอง?"
        size="sm"
        footer={
          <div className="flex gap-3">
            <Button variant="outline" fullWidth onClick={() => setCancelOpen(false)} disabled={busy}>
              ไม่ยกเลิก
            </Button>
            <Button variant="danger" fullWidth onClick={handleCancel} loading={busy}>
              ยืนยันยกเลิก
            </Button>
          </div>
        }
      >
        <p className="text-small text-content-muted">
          ช่องจอด{' '}
          <span className="font-mono font-semibold text-content">{spot?.spotNumber}</span>{' '}
          จะถูกปล่อยคืนให้ผู้อื่นทันที และ
          <strong className="font-semibold text-content">
            {' '}
            ค่าธรรมเนียมการจอง {formatTHB(pricing?.bookingFee)} จะไม่ได้รับคืน
          </strong>
        </p>
      </Modal>
    </div>
  )
}

export default ActiveBooking
