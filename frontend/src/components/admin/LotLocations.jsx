import { useCallback, useEffect, useState } from 'react'
import { LocateFixed, Save, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Badge from '../ui/Badge'
import { staffAPI } from '../../utils/apiService'
import { apiErrorMessage } from '../../utils/api'
import { getPosition, geolocationErrorMessage, parseCoordinates } from '../../utils/geolocation'

/** Admin tool: pin each lot to real coordinates so drivers can check in by GPS. */
const LotLocations = ({ onChange }) => {
  const [zones, setZones] = useState([])
  const [radius, setRadius] = useState({})
  const [typed, setTyped] = useState({})
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    try {
      const { data } = await staffAPI.getZones()
      setZones(data.zones)
    } catch (error) {
      toast.error(apiErrorMessage(error, 'โหลดรายการลานไม่สำเร็จ'))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const pinHere = async (zone) => {
    setBusyId(zone.id)
    try {
      const position = await getPosition()
      if (position.coords.accuracy > 50) {
        toast.error(`GPS คลาดเคลื่อน ~${Math.round(position.coords.accuracy)} ม. ลองยืนกลางลานในที่โล่งแล้วกดใหม่`)
        return
      }
      const { data } = await staffAPI.setZoneLocation(zone.id, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        radiusMeters: Number(radius[zone.id] || zone.checkInRadiusMeters || 100),
      })
      toast.success(data.message)
      load()
      onChange?.()
    } catch (error) {
      toast.error(error?.response ? apiErrorMessage(error) : geolocationErrorMessage(error))
    } finally {
      setBusyId(null)
    }
  }

  // From Google Maps, so a lot can be set up without going there.
  const saveTyped = async (zone) => {
    const point = parseCoordinates(typed[zone.id])
    if (!point) {
      toast.error('อ่านพิกัดไม่ได้ ให้วางเป็นตัวเลขแบบ 13.7299, 100.7782')
      return
    }
    setBusyId(zone.id)
    try {
      const { data } = await staffAPI.setZoneLocation(zone.id, {
        ...point,
        radiusMeters: Number(radius[zone.id] || zone.checkInRadiusMeters || 100),
      })
      toast.success(data.message)
      setTyped((t) => ({ ...t, [zone.id]: '' }))
      load()
      onChange?.()
    } catch (error) {
      toast.error(apiErrorMessage(error))
    } finally {
      setBusyId(null)
    }
  }

  const clear = async (zone) => {
    setBusyId(zone.id)
    try {
      const { data } = await staffAPI.setZoneLocation(zone.id, { clear: true })
      toast.success(data.message)
      load()
      onChange?.()
    } catch (error) {
      toast.error(apiErrorMessage(error))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-h2 text-content">พิกัดลานสำหรับเช็คอินด้วย GPS</h2>
        <p className="mt-1 text-small text-content-muted">
          ตั้งพิกัดกลางลานเพื่อให้ผู้ใช้เช็คอินด้วย GPS ได้ (เหมาะกับลานโล่ง) ทำได้สองแบบ:
          เปิด Google Maps คลิกขวาที่กลางลาน กดตัวเลขพิกัดเพื่อคัดลอก แล้ววางในช่องด้านล่าง
          หรือไปยืนกลางลานแล้วกด &ldquo;ใช้ตำแหน่งที่ยืนอยู่&rdquo;
          ลานที่ยังไม่ตั้งพิกัดเช็คอินได้ด้วย QR ที่ช่องจอดหรือเจ้าหน้าที่สแกนเท่านั้น
        </p>
      </div>

      {zones.map((zone) => (
        <div key={zone.id} className="bg-surface border border-hairline rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-body font-medium text-content truncate">{zone.zoneName}</p>
              <p className="text-micro text-content-muted truncate">{zone.name}</p>
            </div>
            {zone.gpsCheckIn ? (
              <Badge tone="ok" dot>GPS รัศมี {zone.checkInRadiusMeters} ม.</Badge>
            ) : (
              <Badge tone="neutral">ยังไม่ตั้งพิกัด</Badge>
            )}
          </div>

          {zone.gpsCheckIn && (
            <a
              href={`https://www.google.com/maps?q=${zone.latitude},${zone.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-micro text-brand-600 font-mono hover:underline"
            >
              {zone.latitude.toFixed(6)}, {zone.longitude.toFixed(6)}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[14rem]">
              <Input
                label="พิกัดจาก Google Maps"
                placeholder="13.7299, 100.7782"
                inputMode="decimal"
                value={typed[zone.id] ?? ''}
                onChange={(e) => setTyped((t) => ({ ...t, [zone.id]: e.target.value }))}
              />
            </div>
            <Button
              icon={Save}
              loading={busyId === zone.id}
              disabled={!typed[zone.id]?.trim()}
              onClick={() => saveTyped(zone)}
            >
              บันทึกพิกัด
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="w-28">
              <Input
                label="รัศมี (ม.)"
                type="number"
                min={20}
                max={2000}
                value={radius[zone.id] ?? zone.checkInRadiusMeters ?? 100}
                onChange={(e) => setRadius((r) => ({ ...r, [zone.id]: e.target.value }))}
              />
            </div>
            <Button
              variant="soft"
              icon={LocateFixed}
              loading={busyId === zone.id}
              onClick={() => pinHere(zone)}
            >
              ใช้ตำแหน่งที่ยืนอยู่
            </Button>
            {zone.gpsCheckIn && (
              <Button variant="ghost" disabled={busyId === zone.id} onClick={() => clear(zone)}>
                ปิด GPS
              </Button>
            )}
          </div>
        </div>
      ))}
    </section>
  )
}


export default LotLocations
