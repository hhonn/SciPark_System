import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, CameraOff, CheckCircle2, XCircle, ScanLine, MapPin, Keyboard, ShieldCheck } from 'lucide-react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { staffAPI } from '../utils/apiService'
import { apiErrorMessage } from '../utils/api'
import { useAuthStore } from '../stores/authStore'
import { formatTime } from '../utils/format'
import { cn } from '../utils/cn'
import { useQrScanner } from '../utils/useQrScanner'

/** What the last scan did, shown large enough to read at arm's length. */
const ScanResult = ({ result, onNext }) => {
  if (!result) return null

  if (!result.ok) {
    return (
      <div className="rounded-lg border border-risk/30 bg-risk/8 p-5 text-center" role="alert">
        <XCircle className="w-10 h-10 mx-auto text-risk" />
        <p className="mt-2 text-h3 text-content">เช็คอินไม่สำเร็จ</p>
        <p className="mt-1 text-small text-content-muted">{result.message}</p>
        <Button className="mt-4" fullWidth onClick={onNext} icon={ScanLine}>
          สแกนใหม่
        </Button>
      </div>
    )
  }

  const { data } = result
  return (
    <div className="rounded-lg border border-ok/30 bg-ok/8 p-5 text-center" role="status">
      <CheckCircle2 className="w-10 h-10 mx-auto text-ok" />
      <p className="mt-2 text-h3 text-content">เช็คอินสำเร็จ</p>

      {data.vehicle?.photoUrl && (
        <img
          src={data.vehicle.photoUrl}
          alt={`รูปรถ ${data.vehicle.licensePlate}`}
          className="mt-3 w-full max-h-56 object-cover rounded-md border border-hairline"
        />
      )}

      {/* The plate is what the staff member compares against the car. */}
      <p className="mt-3 font-mono text-4xl font-semibold text-content tabular">
        {data.vehicle?.licensePlate || 'ไม่ได้ระบุทะเบียน'}
      </p>
      {data.vehicle && (
        <p className="text-small text-content-muted">
          {[data.vehicle.brand, data.vehicle.model, data.vehicle.color].filter(Boolean).join(' ')}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 text-left">
        <div className="rounded-md bg-surface p-3 border border-hairline">
          <p className="text-micro text-content-muted">ช่องจอด</p>
          <p className="font-mono text-h3 text-content">{data.spotNumber}</p>
          <p className="text-micro text-content-muted">{data.zoneName}</p>
        </div>
        <div className="rounded-md bg-surface p-3 border border-hairline">
          <p className="text-micro text-content-muted">ผู้จอง</p>
          <p className="text-body font-medium text-content truncate">{data.driverName || '-'}</p>
          <p className="text-micro text-content-muted">เวลา {formatTime(data.checkedInAt)}</p>
        </div>
      </div>

      <Button className="mt-4" fullWidth onClick={onNext} icon={ScanLine}>
        สแกนคันถัดไป
      </Button>
    </div>
  )
}

const StaffScan = () => {
  const isAdmin = useAuthStore((s) => Boolean(s.user?.isAdmin))
  const [result, setResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [manualCode, setManualCode] = useState('')

  const submit = useCallback(async (payload) => {
    setSubmitting(true)
    try {
      const { data } = await staffAPI.scan(payload)
      setResult({ ok: true, data: data.data })
      if (navigator.vibrate) navigator.vibrate(80)
    } catch (error) {
      setResult({ ok: false, message: apiErrorMessage(error, 'เช็คอินไม่สำเร็จ') })
      if (navigator.vibrate) navigator.vibrate([60, 60, 60])
    } finally {
      setSubmitting(false)
    }
  }, [])

  const scanner = useQrScanner(submit)

  const next = () => {
    setResult(null)
    setManualCode('')
    scanner.resume()
  }

  const submitManual = (event) => {
    event.preventDefault()
    if (!manualCode.trim()) return
    submit(manualCode.trim())
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <header>
        {isAdmin && (
          <Link to="/app/admin" className="mb-2 inline-flex items-center gap-1.5 text-small text-brand-600 hover:underline">
            <ShieldCheck className="w-4 h-4" />
            ไปหน้าผู้ดูแลระบบ
          </Link>
        )}
        <h1 className="text-h1 text-content">สแกนเช็คอิน</h1>
        <p className="mt-1 text-small text-content-muted">
          สแกน QR บนมือถือของผู้จอง แล้วตรวจทะเบียนรถให้ตรงกับที่แสดง
        </p>
      </header>

      <section className="space-y-4">
        <div
          className={cn(
            'relative aspect-square w-full overflow-hidden rounded-lg border border-hairline bg-black',
            !scanner.active && 'grid place-items-center'
          )}
        >
          <video
            ref={scanner.videoRef}
            className={cn('w-full h-full object-cover', !scanner.active && 'hidden')}
            playsInline
            muted
          />
          <canvas ref={scanner.canvasRef} className="hidden" />

          {scanner.active ? (
            <div className="pointer-events-none absolute inset-[18%] rounded-lg border-2 border-white/80" aria-hidden="true" />
          ) : (
            <div className="text-center p-6">
              <Camera className="w-10 h-10 mx-auto text-white/70" />
              <p className="mt-2 text-small text-white/80">กดเปิดกล้องเพื่อเริ่มสแกน</p>
            </div>
          )}
        </div>

        {scanner.error && <p className="text-small text-risk">{scanner.error}</p>}

        {scanner.active ? (
          <Button variant="outline" fullWidth icon={CameraOff} onClick={scanner.stop}>
            ปิดกล้อง
          </Button>
        ) : (
          <Button size="lg" fullWidth icon={Camera} onClick={scanner.start}>
            เปิดกล้อง
          </Button>
        )}

        {submitting && <p className="text-center text-small text-content-muted">กำลังตรวจสอบ...</p>}
        <ScanResult result={result} onNext={next} />

        {/* For when the camera will not cooperate: the QR's text can be pasted. */}
        {!result && (
          <form onSubmit={submitManual} className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label="หรือกรอกรหัสจาก QR"
                icon={Keyboard}
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <Button type="submit" loading={submitting} disabled={!manualCode.trim()}>
              ตรวจสอบ
            </Button>
          </form>
        )}
      </section>

      {isAdmin && (
        <p className="flex items-center gap-1.5 text-small text-content-muted">
          <MapPin className="w-4 h-4" />
          พิกัดลานและ QR ของช่องย้ายไปอยู่ที่เมนู
          <Link to="/app/admin/lots" className="text-brand-600 hover:underline">ลานและช่องจอด</Link>
        </p>
      )}
    </div>
  )
}

export default StaffScan
