import { useCallback, useEffect, useRef, useState } from 'react'

// How often a camera frame is decoded. Every frame would cook a phone.
const DECODE_EVERY_MS = 150

// Camera QR scanner, shared by the staff scan page and the driver's
// "scan the bay sticker" button.
//
// Decodes with jsQR rather than the browser's BarcodeDetector, which Safari on
// iPhone does not have. jsQR is loaded on the first start(), so nobody
// downloads it until they actually open a camera.
//
// After a detection the scanner pauses; call resume() to scan again.
export function useQrScanner(onDetect) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const frameRef = useRef(0)
  const pausedRef = useRef(false)
  // Bumped by every start() and stop(). A start that finishes after a newer
  // start or a stop (modal closed while the permission prompt was up, React's
  // dev double-mount) must drop its camera instead of taking over.
  const generationRef = useRef(0)
  const [active, setActive] = useState(false)
  const [error, setError] = useState(null)

  const stop = useCallback(() => {
    generationRef.current += 1
    cancelAnimationFrame(frameRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setActive(false)
  }, [])

  const start = useCallback(async () => {
    setError(null)
    const generation = ++generationRef.current
    const stale = () => generation !== generationRef.current
    let stream = null
    try {
      const [decoder, media] = await Promise.all([
        import('jsqr'),
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        }),
      ])
      const jsQR = decoder.default
      stream = media
      const video = videoRef.current
      if (stale() || !video) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      cancelAnimationFrame(frameRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = stream
      video.srcObject = stream
      await video.play()
      if (stale()) return
      pausedRef.current = false
      setActive(true)

      let last = 0
      const tick = (now) => {
        frameRef.current = requestAnimationFrame(tick)
        if (pausedRef.current || now - last < DECODE_EVERY_MS) return
        if (video.readyState < video.HAVE_ENOUGH_DATA) return
        last = now

        const canvas = canvasRef.current
        const width = video.videoWidth
        const height = video.videoHeight
        if (!canvas || !width || !height) return
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(video, 0, 0, width, height)
        const code = jsQR(ctx.getImageData(0, 0, width, height).data, width, height, {
          inversionAttempts: 'dontInvert',
        })
        if (code?.data) {
          pausedRef.current = true
          onDetect(code.data)
        }
      }
      frameRef.current = requestAnimationFrame(tick)
    } catch (err) {
      // A newer start or a stop interrupted this one: not an error.
      if (stale()) {
        if (stream && stream !== streamRef.current) stream.getTracks().forEach((t) => t.stop())
        return
      }
      stop()
      setError(
        err?.name === 'NotAllowedError'
          ? 'ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาอนุญาตในการตั้งค่าเบราว์เซอร์'
          : 'เปิดกล้องไม่ได้ (ต้องเปิดผ่าน HTTPS และอุปกรณ์ต้องมีกล้อง)'
      )
    }
  }, [onDetect, stop])

  const resume = useCallback(() => {
    pausedRef.current = false
  }, [])

  useEffect(() => stop, [stop])

  return { videoRef, canvasRef, active, error, start, stop, resume }
}

export default useQrScanner

// Read a QR from a picture (a screenshot of the ticket, say): one phone
// cannot point its camera at its own screen. Returns the text, or null.
export async function decodeQrImage(file) {
  const [{ default: jsQR }, url] = [await import('jsqr'), URL.createObjectURL(file)]
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = url
    })
    // Phone photos are huge (jsQR is quick up to ~1600px and slow beyond),
    // while a cropped screenshot can be tiny: bring either to 800-1600px.
    // Enlarging is done without smoothing so the modules stay sharp.
    const longest = Math.max(img.naturalWidth, img.naturalHeight)
    const scale = Math.min(1600 / longest, Math.max(1, 800 / longest))
    const width = Math.round(img.naturalWidth * scale)
    const height = Math.round(img.naturalHeight * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.imageSmoothingEnabled = scale < 1
    ctx.drawImage(img, 0, 0, width, height)
    const code = jsQR(ctx.getImageData(0, 0, width, height).data, width, height, { inversionAttempts: 'attemptBoth' })
    return code?.data || null
  } finally {
    URL.revokeObjectURL(url)
  }
}
