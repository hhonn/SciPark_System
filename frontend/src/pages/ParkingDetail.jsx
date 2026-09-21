import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ShieldAlert,
  CreditCard,
  Car,
  Check,
  AlertCircle,
  MapPin,
  Footprints,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import Progress from '../components/ui/Progress'
import EmptyState from '../components/ui/EmptyState'
import { PageLoader } from '../components/ui/Loading'
import LotPlan from '../components/LotPlan'
import { parkingAPI, bookingAPI, vehicleAPI, paymentAPI } from '../utils/apiService'
import { apiErrorMessage } from '../utils/api'
import { useBookingStore } from '../stores/bookingStore'
import { usePricing } from '../stores/pricingStore'
import { availabilityTone, formatTHB } from '../utils/format'
import { cn } from '../utils/cn'

/**
 * Reshape a `POST /bookings` response into what `GET /bookings/active` returns.
 *
 * The two endpoints describe the same booking differently, and the store was
 * being seeded with the create shape as-is. The booking screen then read
 * `pricing.estimatedTotalCost`, `duration` and `timeRemainingToCheckIn` off an
 * object that had none of them, until its own fetch replaced the whole thing a
 * moment later.
 *
 * Nothing here is guessed: a booking that was created one instant ago is always
 * pending, un-checked-in, and has accrued no parking time and no overtime.
 */
const toActiveBooking = (booking) => {
  const remainingMs = booking.checkInDeadline
    ? Math.max(0, new Date(booking.checkInDeadline).getTime() - Date.now())
    : 0

  return {
    bookingId: booking.bookingId,
    spot: booking.spot,
    zone: booking.zone,
    vehicle: booking.vehicle,
    startTime: booking.startTime,
    actualStartTime: null,
    checkInDeadline: booking.checkInDeadline,
    graceMinutes: booking.graceMinutes,
    isCheckedIn: false,
    status: 'pending',
    paymentStatus: 'paid',
    duration: { hours: 0, minutes: 0 },
    timeRemainingToCheckIn: {
      minutes: Math.floor(remainingMs / 60000),
      seconds: Math.floor((remainingMs % 60000) / 1000),
      totalMs: remainingMs,
      expired: remainingMs <= 0,
    },
    pricing: {
      ...booking.pricing,
      chargeableHours: 0,
      discount: 0,
      tierName: null,
      estimatedOvertimeCost: 0,
      estimatedTotalCost: booking.pricing?.bookingFee ?? 0,
    },
  }
}

/**
 * Zone detail and booking confirmation.
 *
 * Implements Test Cases 19–21: the confirmation step states the fee, the
 * check-in deadline and the forfeiture warning, and creates nothing until the
 * user confirms. The spot number is assigned by the server on confirm, so the
 * screen deliberately does not promise a specific bay beforehand. Every figure
 * quoted here comes from the server (see stores/pricingStore).
 */
const ParkingDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { setActiveBooking, setQrToken } = useBookingStore()
  const { bookingFee, freeHours, overtimeRate, graceMinutes } = usePricing()

  const [zone, setZone] = useState(null)
  const [spots, setSpots] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [paymentMethods, setPaymentMethods] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selectedVehicle, setSelectedVehicle] = useState('')
  const [selectedPayment, setSelectedPayment] = useState('')

  const load = useCallback(async () => {
    try {
      const [zoneRes, vehicleRes, paymentRes] = await Promise.allSettled([
        parkingAPI.getZoneById(id),
        vehicleAPI.getAll(),
        paymentAPI.getAll(),
      ])

      if (zoneRes.status === 'rejected') throw zoneRes.reason

      setZone(zoneRes.value.data.zone)
      setSpots(zoneRes.value.data.spots || [])

      if (vehicleRes.status === 'fulfilled') {
        const list = vehicleRes.value.data.data || []
        setVehicles(list)
        setSelectedVehicle(list.find((v) => v.isDefault)?.id || list[0]?.id || '')
      }

      if (paymentRes.status === 'fulfilled') {
        const list = paymentRes.value.data.data || []
        setPaymentMethods(list)
        setSelectedPayment(list.find((p) => p.isDefault)?.id || list[0]?.id || '')
      }

      setError(null)
    } catch (err) {
      setError(apiErrorMessage(err, 'โหลดข้อมูลลานจอดไม่สำเร็จ'))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      const { data } = await bookingAPI.createBooking({
        zoneId: id,
        vehicleId: selectedVehicle || undefined,
        paymentMethodId: selectedPayment || undefined,
      })

      const booking = data.data
      setActiveBooking(toActiveBooking(booking))
      // Held in memory only: it is the credential the QR encodes.
      setQrToken(booking.qrCode?.token || null)

      setConfirmOpen(false)
      toast.success(`จองสำเร็จ ช่อง ${booking.spot?.spotNumber}`)
      navigate('/app/booking', { replace: true })
    } catch (err) {
      const status = err.response?.status
      const code = err.response?.data?.code
      const message = apiErrorMessage(err, 'จองไม่สำเร็จ')

      // Test Case 3: a declined payment must not leave a booking behind.
      if (status === 402) {
        setConfirmOpen(false)
        toast.error(message)
        if (code === 'no_payment_method') navigate('/app/payment-methods')
      } else if (status === 409) {
        // Test Case 2: the zone filled up between loading and confirming.
        setConfirmOpen(false)
        toast.error(message)
        load()
      } else {
        toast.error(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <PageLoader label="กำลังโหลดข้อมูลลานจอด..." />

  if (error || !zone) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="ไม่พบลานจอดนี้"
        description={error || 'ลานจอดอาจถูกนำออกจากระบบแล้ว'}
        action={
          <Link to="/app">
            <Button icon={ArrowLeft}>กลับหน้าหลัก</Button>
          </Link>
        }
      />
    )
  }

  const tone = availabilityTone(zone.availableSpots, zone.totalSpots)
  const isFull = zone.isFull || zone.availableSpots === 0
  const selectedVehicleData = vehicles.find((v) => v.id === selectedVehicle)
  const selectedPaymentData = paymentMethods.find((p) => p.id === selectedPayment)

  return (
    <div className="space-y-6 pb-24 lg:pb-20">
      <Link
        to="/app"
        className="inline-flex items-center gap-1.5 text-small text-content-muted hover:text-content transition-colors duration-fast"
      >
        <ArrowLeft className="w-4 h-4" />
        ลานจอดทั้งหมด
      </Link>

      <header className="bg-surface border border-hairline rounded-lg p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <h1 className="text-h1 text-content">{zone.name}</h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-content-muted">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-4 h-4 shrink-0" aria-hidden="true" />
                {zone.building}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Footprints className="w-4 h-4 shrink-0" aria-hidden="true" />
                เดิน {zone.walkMinutes ?? '-'} นาทีถึงคณะ
              </span>
              <span className="font-mono text-content-subtle">{zone.zoneName}</span>
            </p>
          </div>

          {/* The count is the headline figure, not a footnote in a badge. */}
          <div className="text-right shrink-0">
            <p
              className={cn(
                'font-mono text-5xl font-semibold leading-none tabular',
                tone === 'ok' && 'text-ok',
                tone === 'warn' && 'text-warn',
                tone === 'risk' && 'text-risk'
              )}
            >
              {zone.availableSpots}
            </p>
            <p className="mt-1 text-micro text-content-subtle">
              ว่างจาก {zone.totalSpots} ช่อง
            </p>
          </div>
        </div>

        {zone.description && (
          <p className="mt-4 text-small text-content-muted leading-relaxed">{zone.description}</p>
        )}

        <div className="mt-5">
          <Progress
            value={zone.availableSpots}
            max={zone.totalSpots}
            tone={tone}
            label={`ที่ว่าง ${zone.availableSpots} จาก ${zone.totalSpots}`}
          />
          <div className="mt-2 flex items-center justify-between text-micro text-content-subtle">
            <Badge tone={tone} dot>
              {isFull ? 'เต็มแล้ว' : `พร้อมจอง ${zone.availableSpots} ช่อง`}
            </Badge>
            <span className="tabular">ใช้งานอยู่ {zone.occupancyRate}%</span>
          </div>
        </div>
      </header>

      {/* Price summary */}
      <section className="bg-surface border border-hairline rounded-lg p-5 sm:p-6">
        <h2 className="text-h2 text-content">ค่าบริการ</h2>
        <ul className="mt-4 divide-y divide-hairline">
          {[
            ['ค่าธรรมเนียมการจอง', `${bookingFee} บาท/ครั้ง`],
            [`${freeHours} ชั่วโมงแรก`, 'ฟรี'],
            ['ชั่วโมงถัดไป', `${overtimeRate} บาท/ชม.`],
          ].map(([label, value]) => (
            <li key={label} className="flex items-center justify-between py-3">
              <span className="text-small text-content-muted">{label}</span>
              <span className="font-mono text-small font-semibold text-content tabular">{value}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Spot map — informational. The server assigns the bay on confirm. */}
      {spots.length > 0 && (
        <section className="bg-surface border border-hairline rounded-lg p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-h2 text-content">ผังลานจอด</h2>
            <div className="flex items-center gap-4 text-micro text-content-subtle">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-ok" /> ว่าง
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-warn" /> ถูกจองไว้
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-ink-300" /> มีรถจอด
              </span>
            </div>
          </div>

          <LotPlan spots={spots} className="mt-4" />

          <p className="mt-3 text-micro text-content-subtle">
            ระบบจะเลือกช่องจอดที่ว่างให้อัตโนมัติหลังชำระเงินสำเร็จ
          </p>
        </section>
      )}

      {/* Sticky action bar — the primary action stays reachable one-handed. */}
      <div className="sticky bottom-[calc(theme(spacing.tabbar)+0.5rem)] lg:bottom-4 z-30">
        <div className="bg-surface/95 backdrop-blur-xl border border-hairline rounded-lg shadow-e3 p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-micro text-content-subtle">ค่าธรรมเนียมการจอง</p>
            <p className="font-mono text-h2 font-semibold text-content tabular">
              {formatTHB(bookingFee)}
            </p>
          </div>

          <Button
            size="lg"
            disabled={isFull}
            onClick={() => setConfirmOpen(true)}
            className="min-w-[8rem]"
          >
            {isFull ? 'ที่จอดเต็ม' : 'จองที่จอด'}
          </Button>
        </div>
      </div>

      {/* ---- Confirmation (Test Case 19/20/21) ---- */}
      <Modal
        open={confirmOpen}
        onClose={() => !submitting && setConfirmOpen(false)}
        title="ยืนยันการจอง"
        description={zone.name}
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              fullWidth
              onClick={() => setConfirmOpen(false)}
              disabled={submitting}
            >
              ยกเลิก
            </Button>
            <Button fullWidth onClick={handleConfirm} loading={submitting} data-autofocus>
              ยืนยันและชำระ {bookingFee} บาท
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <dl className="divide-y divide-hairline">
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-small text-content-muted">โซน</dt>
              <dd className="text-small font-medium text-content">{zone.name}</dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-small text-content-muted">ช่องว่างขณะนี้</dt>
              <dd className="font-mono text-small font-medium text-content tabular">
                {zone.availableSpots} ช่อง
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-small text-content-muted">ค่าธรรมเนียม</dt>
              <dd className="font-mono text-small font-semibold text-content tabular">
                {formatTHB(bookingFee)}
              </dd>
            </div>
          </dl>

          {/* Vehicle */}
          {vehicles.length > 0 && (
            <div>
              <label htmlFor="vehicle" className="block mb-1.5 text-small font-medium text-content">
                ยานพาหนะ
              </label>
              <select
                id="vehicle"
                value={selectedVehicle}
                onChange={(e) => setSelectedVehicle(e.target.value)}
                className="w-full h-11 px-3 rounded-md bg-surface border-2 border-hairline text-content focus:border-brand-500 focus:outline-none"
              >
                <option value="">ไม่ระบุ</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.licensePlate} — {vehicle.brand} {vehicle.model}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Payment */}
          <div>
            <label htmlFor="payment" className="block mb-1.5 text-small font-medium text-content">
              ชำระด้วย
            </label>

            {paymentMethods.length === 0 ? (
              <div className="flex items-start gap-3 p-3 rounded-md bg-risk/8 border border-risk/25">
                <CreditCard className="w-5 h-5 text-risk shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-small text-content">ยังไม่มีวิธีการชำระเงิน</p>
                  <Link
                    to="/app/payment-methods"
                    className="text-small font-semibold text-brand-600 hover:underline"
                  >
                    เพิ่มวิธีการชำระเงิน
                  </Link>
                </div>
              </div>
            ) : (
              <select
                id="payment"
                value={selectedPayment}
                onChange={(e) => setSelectedPayment(e.target.value)}
                className="w-full h-11 px-3 rounded-md bg-surface border-2 border-hairline text-content focus:border-brand-500 focus:outline-none"
              >
                {paymentMethods.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.displayName || method.type}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* The forfeiture warning is mandatory copy per the requirements. */}
          <div className="flex items-start gap-3 p-3.5 rounded-md bg-warn/10 border border-warn/25">
            <ShieldAlert className="w-5 h-5 text-warn shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-small text-content space-y-1">
              <p>
                <strong className="font-semibold">
                  ต้องสแกน QR เข้าจอดภายใน {graceMinutes} นาที
                </strong>
              </p>
              <p className="text-content-muted">
                หากไม่เข้าจอดตามเวลา ระบบจะยกเลิกการจองอัตโนมัติ และ
                <strong className="font-semibold text-content">
                  {' '}
                  ค่าธรรมเนียม {bookingFee} บาทจะไม่ได้รับคืน
                </strong>
              </p>
            </div>
          </div>

          <p className="flex items-start gap-2 text-micro text-content-subtle">
            <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            ระบบจะเลือกและแจ้งหมายเลขช่องจอดให้หลังชำระเงินสำเร็จ
          </p>

          {(selectedVehicleData || selectedPaymentData) && (
            <p className="flex items-center gap-2 text-micro text-content-subtle">
              <Car className="w-3.5 h-3.5 shrink-0" />
              {selectedVehicleData
                ? `${selectedVehicleData.licensePlate} · `
                : ''}
              {selectedPaymentData?.displayName || ''}
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}

export default ParkingDetail
