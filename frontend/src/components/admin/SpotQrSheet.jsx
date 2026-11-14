import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Printer, RefreshCw, QrCode } from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'
import { Spinner } from '../ui/Loading'
import { adminAPI } from '../../utils/apiService'
import { apiErrorMessage } from '../../utils/api'
import { spotQrUrl } from '../../utils/spotQr'

// Admin tab: the QR sticker for every bay of a lot, ready to print.
//
// Each sticker holds a link to this site (/app/arrive?...), so print from the
// address drivers will use. Moving the site to another domain means
// reprinting.

const escapeHtml = (text) =>
  String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const toQr = (spot) =>
  QRCode.toDataURL(spotQrUrl(window.location.origin, spot.id, spot.code), {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 360,
  })

// A page of stickers, six to an A4 sheet, in a window of its own.
const printStickers = async (zone, spots, images) => {
  const win = window.open('', '_blank')
  if (!win) {
    toast.error('เบราว์เซอร์บล็อกหน้าต่างใหม่ กรุณาอนุญาต pop-up แล้วลองอีกครั้ง')
    return
  }

  const place = escapeHtml(zone?.name ? `${zone.name} (${zone.zoneName})` : zone?.zoneName || '')
  const stickers = spots
    .map(
      (s) => `
      <div class="sticker">
        <p class="brand">SciPark</p>
        <p class="spot">${escapeHtml(s.spotNumber)}</p>
        <p class="place">${place}${s.floor ? ` ${escapeHtml(s.floor)}` : ''}</p>
        <img src="${images[s.id]}" alt="">
        <p class="hint">จอดแล้วสแกนด้วยกล้องมือถือเพื่อเช็คอิน</p>
      </div>`
    )
    .join('')

  win.document.write(`<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>QR ช่องจอด ${place}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Sarabun", "Noto Sans Thai", Tahoma, sans-serif; color: #111; background: #fff; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6mm; }
  .sticker { border: 1px dashed #999; border-radius: 4mm; padding: 5mm; text-align: center; height: 88mm; break-inside: avoid; }
  .brand { margin: 0; font-size: 10pt; letter-spacing: .08em; text-transform: uppercase; color: #555; }
  .spot { margin: 1mm 0 0; font-size: 30pt; font-weight: 700; font-family: ui-monospace, Menlo, Consolas, monospace; }
  .place { margin: 0 0 2mm; font-size: 10pt; color: #444; }
  img { width: 48mm; height: 48mm; }
  .hint { margin: 2mm 0 0; font-size: 10pt; }
</style></head>
<body><div class="grid">${stickers}</div></body></html>`)
  win.document.close()

  // Print once every QR image is decoded, or some come out blank.
  await Promise.all([...win.document.images].map((img) => img.decode().catch(() => {})))
  win.focus()
  win.print()
}

const SpotQrSheet = () => {
  const [zones, setZones] = useState([])
  const [zoneId, setZoneId] = useState('')
  const [spots, setSpots] = useState([])
  const [images, setImages] = useState({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async (id) => {
    setLoading(true)
    try {
      const { data } = await adminAPI.getSpotCodes(id)
      const rendered = await Promise.all(data.spots.map(async (s) => [s.id, await toQr(s)]))
      setZones(data.zones)
      setZoneId(data.zoneId || '')
      setSpots(data.spots)
      setImages(Object.fromEntries(rendered))
    } catch (error) {
      toast.error(apiErrorMessage(error, 'โหลด QR ช่องจอดไม่สำเร็จ'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const rotate = async (spot) => {
    if (!window.confirm(`เปลี่ยน QR ของช่อง ${spot.spotNumber}? สติกเกอร์เดิมจะใช้ไม่ได้ทันที ต้องพิมพ์ติดใหม่`)) return
    setBusyId(spot.id)
    try {
      const { data } = await adminAPI.rotateSpotCode(spot.id)
      const image = await toQr(data.spot)
      setSpots((list) => list.map((s) => (s.id === spot.id ? { ...s, code: data.spot.code } : s)))
      setImages((map) => ({ ...map, [spot.id]: image }))
      toast.success(data.message)
    } catch (error) {
      toast.error(apiErrorMessage(error, 'เปลี่ยน QR ไม่สำเร็จ'))
    } finally {
      setBusyId(null)
    }
  }

  const zone = zones.find((z) => z.id === zoneId)

  return (
    <div className="space-y-4">
      <p className="text-small text-content-muted">
        พิมพ์ QR แล้วติดไว้ที่แต่ละช่องจอด ผู้ใช้จอดแล้วสแกน QR ของช่องนั้นเพื่อเช็คอินเอง ไม่ต้องมีเจ้าหน้าที่
        ถ้ารูป QR ของช่องไหนหลุดออกไป ให้กด &ldquo;เปลี่ยน QR&rdquo; แล้วพิมพ์ช่องนั้นใหม่
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex-1 min-w-[12rem]">
          <span className="block text-small font-medium text-content mb-1.5">ลานจอด</span>
          <select
            className="w-full h-11 rounded-md border border-hairline bg-surface px-3 text-body text-content"
            value={zoneId}
            onChange={(e) => load(e.target.value)}
            disabled={loading}
          >
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name ? `${z.name} (${z.zoneName})` : z.zoneName}
              </option>
            ))}
          </select>
        </label>
        <Button
          icon={Printer}
          disabled={loading || spots.length === 0}
          onClick={() => printStickers(zone, spots, images)}
        >
          พิมพ์ทั้งลาน ({spots.length})
        </Button>
      </div>

      {loading ? (
        <div className="py-10 grid place-items-center"><Spinner /></div>
      ) : spots.length === 0 ? (
        <div className="bg-surface border border-hairline rounded-lg">
          <EmptyState icon={QrCode} title="ลานนี้ยังไม่มีช่องจอด" />
        </div>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {spots.map((s) => (
            <li key={s.id} className="bg-surface border border-hairline rounded-lg p-3 text-center">
              <p className="font-mono text-h3 font-semibold text-content tabular">{s.spotNumber}</p>
              {images[s.id] && (
                <img
                  src={images[s.id]}
                  alt={`QR เช็คอินช่อง ${s.spotNumber}`}
                  className="mt-2 w-full max-w-[9rem] mx-auto aspect-square bg-white rounded-sm"
                />
              )}
              <Button
                size="sm"
                variant="ghost"
                icon={RefreshCw}
                className="mt-2"
                loading={busyId === s.id}
                onClick={() => rotate(s)}
              >
                เปลี่ยน QR
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default SpotQrSheet
