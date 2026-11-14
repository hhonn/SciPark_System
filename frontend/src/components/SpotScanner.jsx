import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus } from 'lucide-react'
import Button from './ui/Button'
import { useQrScanner, decodeQrImage } from '../utils/useQrScanner'
import { parseSpotQr } from '../utils/spotQr'
import { cn } from '../utils/cn'

// The QR on a booking's ticket carries JSON with the booking id.
const isBookingQr = (text) => {
  try {
    return Boolean(JSON.parse(text)?.bookingId)
  } catch {
    return false
  }
}

// Check-in scanner. Opens the camera as soon as it mounts and closes it on
// unmount; a picture can be chosen instead (a screenshot of the ticket).
//
// - A bay sticker calls onSpot({ spotId, code }).
// - The driver's own ticket QR calls onTicket(text), but only when onTicket
//   is given (demo lots). Otherwise it gets a hint, as does anything else.
const SpotScanner = ({ onSpot, onTicket, spotNumber, allowSpot = true }) => {
  const [hint, setHint] = useState(null)
  const resumeRef = useRef(() => {})
  const fileRef = useRef(null)
  const bay = spotNumber ? `ช่อง ${spotNumber}` : 'ช่องจอดของคุณ'

  const handle = useCallback(
    (text) => {
      const spot = allowSpot ? parseSpotQr(text) : null
      if (spot) {
        onSpot(spot)
        return
      }
      if (onTicket && isBookingQr(text)) {
        onTicket(text)
        return
      }
      setHint(
        isBookingQr(text)
          ? `นี่คือ QR บนบัตรจอดของคุณเอง ใช้เช็คอินในลานนี้ไม่ได้ ให้สแกนสติกเกอร์ QR ที่ติดอยู่ที่${bay}`
          : onTicket && !allowSpot
            ? 'QR นี้ไม่ใช่ QR บนบัตรจอดของการจองนี้'
            : `QR นี้ใช้เช็คอินไม่ได้ ให้สแกนสติกเกอร์ QR ที่ติดอยู่ที่${bay}`
      )
      window.setTimeout(() => resumeRef.current(), 1500)
    },
    [onSpot, onTicket, allowSpot, bay]
  )

  const scanner = useQrScanner(handle)
  resumeRef.current = scanner.resume

  const { start } = scanner
  useEffect(() => {
    start()
  }, [start])

  const pickImage = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const text = await decodeQrImage(file).catch(() => null)
    if (text) handle(text)
    else setHint('หา QR ในรูปนี้ไม่เจอ ลองครอปให้เห็น QR ชัด ๆ แล้วเลือกใหม่')
  }

  const aimAt = onTicket
    ? allowSpot
      ? `สแกน QR บนบัตรจอด หรือสติกเกอร์ QR ที่${bay}`
      : 'สแกน QR บนบัตรจอดของคุณ (จากอีกจอ หรือเลือกรูปที่แคปไว้)'
    : `เล็งกล้องไปที่สติกเกอร์ QR ที่ติดอยู่ที่${bay}`

  return (
    <div className="space-y-3">
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
            <p className="mt-2 text-small text-white/80">กำลังเปิดกล้อง...</p>
          </div>
        )}
      </div>

      {scanner.error ? (
        <div className="space-y-2">
          <p className="text-small text-risk">{scanner.error}</p>
          <Button variant="outline" fullWidth icon={Camera} onClick={start}>
            ลองเปิดกล้องอีกครั้ง
          </Button>
        </div>
      ) : (
        <p className={cn('text-small text-center', hint ? 'text-warn' : 'text-content-muted')}>{hint || aimAt}</p>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />
      <Button variant="ghost" fullWidth icon={ImagePlus} onClick={() => fileRef.current?.click()}>
        เลือกรูป QR จากเครื่อง
      </Button>
    </div>
  )
}

export default SpotScanner
