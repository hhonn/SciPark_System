import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { MapPin, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '../components/ui/Button'
import { PageLoader } from '../components/ui/Loading'
import { bookingAPI } from '../utils/apiService'
import { apiErrorMessage } from '../utils/api'
import { getPosition, geolocationErrorMessage } from '../utils/geolocation'
import { formatTHB, formatTime } from '../utils/format'
import { cn } from '../utils/cn'

/**
 * Where a bay's QR sticker leads (/app/arrive?s=<bay>&c=<code>).
 *
 * Reached either from the phone's camera app or from the in-app scanner. It
 * shows which bay the sticker belongs to next to the driver's booking, and
 * checks in only after the driver confirms.
 */

const Panel = ({ tone = 'neutral', icon: Icon, title, children }) => (
  <section
    className={cn(
      'rounded-xl border p-6 text-center',
      tone === 'ok' && 'bg-ok/6 border-ok/30',
      tone === 'warn' && 'bg-warn/6 border-warn/30',
      tone === 'risk' && 'bg-risk/6 border-risk/30',
      tone === 'neutral' && 'bg-surface border-hairline'
    )}
  >
    <Icon
      className={cn(
        'w-10 h-10 mx-auto',
        tone === 'ok' && 'text-ok',
        tone === 'warn' && 'text-warn',
        tone === 'risk' && 'text-risk',
        tone === 'neutral' && 'text-content-subtle'
      )}
    />
    <h1 className="mt-3 text-h2 text-content">{title}</h1>
    <div className="mt-2 text-small text-content-muted">{children}</div>
  </section>
)

const SpotCard = ({ spot }) => (
  <section className="bg-surface border border-hairline rounded-lg p-5 flex items-center justify-between gap-4">
    <div className="min-w-0">
      <p className="text-micro text-content-subtle">ช่องที่สแกน</p>
      <p className="font-mono text-4xl font-semibold text-brand-600 tabular mt-0.5">{spot.spotNumber}</p>
      <p className="mt-1 text-small text-content-muted truncate">
        {[spot.zoneLabel || spot.zoneName, spot.floor].filter(Boolean).join(' ')}
        {spot.building && <span className="block truncate">{spot.building}</span>}
      </p>
    </div>
    <span className="w-12 h-12 rounded-md bg-brand-500/10 text-brand-600 flex items-center justify-center shrink-0">
      <MapPin className="w-6 h-6" />
    </span>
  </section>
)

const Arrive = () => {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const spotId = params.get('s')
  const code = params.get('c')

  const [result, setResult] = useState(null) // { data } | { error }
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!spotId || !code) {
      setResult({ error: 'ลิงก์ QR ไม่ครบ กรุณาสแกนใหม่' })
      return undefined
    }
    let live = true
    bookingAPI
      .scanSpot({ spotId, code })
      .then(({ data }) => live && setResult({ data: data.data }))
      .catch((error) => live && setResult({ error: apiErrorMessage(error, 'อ่าน QR ไม่สำเร็จ') }))
    return () => {
      live = false
    }
  }, [spotId, code])

  const confirm = async () => {
    const { data } = result
    setBusy(true)

    // Where the lot has coordinates the server also needs the phone inside
    // it (so a photo of the sticker is no use from elsewhere). Lots without
    // coordinates go on the sticker alone.
    let location = {}
    if (data.gpsCheck) {
      try {
        const { coords } = await getPosition()
        location = { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }
      } catch (error) {
        toast.error(geolocationErrorMessage(error))
        setBusy(false)
        return
      }
    }

    try {
      await bookingAPI.checkInAtSpot(data.booking.bookingId, { spotId, code, ...location })
      toast.success('เช็คอินสำเร็จ เริ่มนับเวลาจอดแล้ว')
      navigate('/app/booking', { replace: true })
    } catch (error) {
      toast.error(apiErrorMessage(error, 'เช็คอินไม่สำเร็จ'))
      if (error.response?.data?.code === 'checkin_expired') navigate('/app', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  if (!result) return <PageLoader label="กำลังอ่าน QR..." />

  if (result.error) {
    return (
      <div className="max-w-md mx-auto space-y-4">
        <Panel tone="risk" icon={XCircle} title="ใช้ QR นี้ไม่ได้">
          {result.error}
        </Panel>
        <Link to="/app/booking">
          <Button fullWidth variant="outline">ไปที่การจองของฉัน</Button>
        </Link>
      </div>
    )
  }

  const { state, spot, booking } = result.data
  const toBooking = (
    <Link to="/app/booking">
      <Button fullWidth size="lg">ไปที่การจองของฉัน</Button>
    </Link>
  )

  return (
    <div className="max-w-md mx-auto space-y-4">
      <SpotCard spot={spot} />

      {state === 'ready' && (
        <>
          <Panel tone="ok" icon={CheckCircle2} title="ตรงกับช่องที่คุณจองไว้">
            กดยืนยันเมื่อจอดรถในช่องนี้แล้ว ระบบจะเริ่มนับเวลาจอดทันที
            <br />
            เช็คอินได้ถึง {formatTime(booking.checkInDeadline)} น.
          </Panel>
          <Button fullWidth size="lg" icon={CheckCircle2} onClick={confirm} loading={busy}>
            ยืนยันว่าถึงแล้ว
          </Button>
          <Link to="/app/booking">
            <Button fullWidth variant="ghost" disabled={busy}>ยังไม่ใช่ตอนนี้</Button>
          </Link>
        </>
      )}

      {state === 'wrong_spot' && (
        <>
          <Panel tone="warn" icon={AlertTriangle} title="ไม่ใช่ช่องที่คุณจอง">
            คุณจองช่อง <span className="font-mono font-semibold text-content">{booking.spotNumber}</span>
            {booking.zoneName ? ` (${booking.zoneName})` : ''} ไว้ กรุณาไปจอดที่ช่องนั้นแล้วสแกน QR ที่ช่องนั้น
          </Panel>
          {toBooking}
        </>
      )}

      {state === 'no_booking' && (
        <>
          <Panel icon={MapPin} title="คุณยังไม่มีการจอง">
            จองที่จอดก่อน แล้วค่อยสแกน QR ที่ช่องที่ได้รับ
          </Panel>
          <Link to={spot.zoneId ? `/app/parking/${spot.zoneId}` : '/app'}>
            <Button fullWidth size="lg">จองลานนี้</Button>
          </Link>
        </>
      )}

      {state === 'already_checked_in' && (
        <>
          <Panel tone="ok" icon={CheckCircle2} title="เช็คอินช่องนี้แล้ว">
            กำลังนับเวลาจอด เมื่อจะออกให้กดเช็คเอาต์ในหน้าการจอง
          </Panel>
          {toBooking}
        </>
      )}

      {state === 'checked_in_elsewhere' && (
        <>
          <Panel tone="warn" icon={AlertTriangle} title="คุณจอดอยู่ที่ช่องอื่น">
            ตอนนี้คุณเช็คอินอยู่ที่ช่อง{' '}
            <span className="font-mono font-semibold text-content">{booking.spotNumber}</span>
          </Panel>
          {toBooking}
        </>
      )}

      {state === 'expired' && (
        <>
          <Panel tone="risk" icon={XCircle} title="หมดเวลาเช็คอินแล้ว">
            การจองถูกยกเลิกอัตโนมัติ ค่าจอง {formatTHB(booking.bookingFee)} ไม่ได้รับคืน
          </Panel>
          <Link to="/app">
            <Button fullWidth size="lg">จองใหม่</Button>
          </Link>
        </>
      )}
    </div>
  )
}

export default Arrive
