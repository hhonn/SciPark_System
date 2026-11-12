import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import Button from './ui/Button'
import { useQrScanner } from '../utils/useQrScanner'
import { parseSpotQr } from '../utils/spotQr'
import { cn } from '../utils/cn'

/**
 * Camera view for scanning the QR sticker on a parking bay. Opens the camera
 * as soon as it mounts and closes it on unmount. Calls onSpot({ spotId, code })
 * for a bay sticker; anything else gets a hint and scanning carries on.
 */
const SpotScanner = ({ onSpot }) => {
  const [hint, setHint] = useState(null)
  const resumeRef = useRef(() => {})

  const handle = useCallback(
    (text) => {
      const spot = parseSpotQr(text)
      if (spot) {
        onSpot(spot)
        return
      }
      setHint('QR นี้ไม่ใช่ QR ของช่องจอด ให้สแกน QR ที่ติดอยู่ที่ช่องจอดของคุณ')
      window.setTimeout(() => resumeRef.current(), 1500)
    },
    [onSpot]
  )

  const scanner = useQrScanner(handle)
  resumeRef.current = scanner.resume

  const { start } = scanner
  useEffect(() => {
    start()
  }, [start])

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
          <p className="text-small text-content-muted">
            หรือเปิดแอปกล้องของมือถือแล้วสแกน QR ที่ช่องจอดได้เลย ลิงก์จะเปิดหน้ายืนยันให้เอง
          </p>
          <Button variant="outline" fullWidth icon={Camera} onClick={start}>
            ลองเปิดกล้องอีกครั้ง
          </Button>
        </div>
      ) : (
        <p className={cn('text-small text-center', hint ? 'text-warn' : 'text-content-muted')}>
          {hint || 'เล็งกล้องไปที่ QR ที่ติดอยู่ที่ช่องจอดของคุณ'}
        </p>
      )}
    </div>
  )
}

export default SpotScanner
