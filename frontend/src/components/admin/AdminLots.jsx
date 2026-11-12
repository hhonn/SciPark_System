import { useCallback, useEffect, useState } from 'react'
import { Plus, MapPin, QrCode, ParkingSquare } from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Badge from '../ui/Badge'
import EmptyState from '../ui/EmptyState'
import { Spinner } from '../ui/Loading'
import { adminAPI } from '../../utils/apiService'
import { apiErrorMessage } from '../../utils/api'
import { cn } from '../../utils/cn'
import LotLocations from './LotLocations'
import SpotQrSheet from './SpotQrSheet'

/**
 * Admin: lots and bays. Three jobs, one menu entry: the bays themselves,
 * where each lot is (for GPS check-in), and the QR stickers.
 */

const SPOT_STYLE = {
  available: { box: 'bg-ok/12 border-ok/35 text-ok', label: 'ว่าง' },
  reserved: { box: 'bg-warn/12 border-warn/35 text-warn', label: 'ถูกจอง' },
  occupied: { box: 'bg-brand-500/12 border-brand-500/35 text-brand-600', label: 'มีรถจอด' },
  closed: { box: 'bg-surface-2 border-hairline text-content-subtle line-through', label: 'ปิดใช้งาน' },
}

const VIEWS = [
  { id: 'spots', label: 'ช่องจอด', icon: ParkingSquare },
  { id: 'gps', label: 'พิกัด GPS', icon: MapPin },
  { id: 'qr', label: 'พิมพ์ QR', icon: QrCode },
]

const AddLotForm = ({ onAdded }) => {
  const [form, setForm] = useState({ zoneName: '', name: '', building: '' })
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    try {
      const { data } = await adminAPI.createLot(form)
      toast.success(data.message)
      setForm({ zoneName: '', name: '', building: '' })
      onAdded(data.lot)
    } catch (error) {
      toast.error(apiErrorMessage(error, 'เพิ่มลานไม่สำเร็จ'))
    } finally {
      setBusy(false)
    }
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <form onSubmit={submit} className="bg-surface border border-hairline rounded-lg p-4 space-y-3">
      <h3 className="text-h3 text-content">เพิ่มลานใหม่</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="รหัสลาน" placeholder="SCI-C" value={form.zoneName} onChange={set('zoneName')} required />
        <Input label="ชื่อลาน" placeholder="ลานข้างโรงอาหาร" value={form.name} onChange={set('name')} required />
        <Input label="อาคาร (ถ้ามี)" placeholder="คณะวิทยาศาสตร์" value={form.building} onChange={set('building')} />
      </div>
      <Button type="submit" icon={Plus} loading={busy} disabled={!form.zoneName.trim() || !form.name.trim()}>
        เพิ่มลาน
      </Button>
    </form>
  )
}

/** Drivers are offered "scan the QR at your bay" only once this is on. */
const StickerSwitch = ({ lot, onChanged }) => {
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    setBusy(true)
    try {
      const { data } = await adminAPI.updateLot(lot.id, { spotStickers: !lot.spotStickers })
      toast.success(data.message)
      onChanged()
    } catch (error) {
      toast.error(apiErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <label className="flex items-start gap-3 rounded-md border border-hairline p-3 cursor-pointer">
      <input
        type="checkbox"
        className="mt-1 w-4 h-4 accent-brand-500"
        checked={Boolean(lot.spotStickers)}
        disabled={busy}
        onChange={toggle}
      />
      <span className="text-small">
        <span className="block font-medium text-content">ติดสติกเกอร์ QR ที่ช่องจอดของลานนี้แล้ว</span>
        <span className="block text-content-muted">
          เปิดแล้วผู้ใช้จะเห็นปุ่ม &ldquo;สแกน QR ที่ช่องจอด&rdquo;
          {lot.gpsCheckIn
            ? ' ลานนี้ตั้งพิกัดไว้ ตอนสแกนจึงต้องเปิด GPS และอยู่ในรัศมีด้วย'
            : ' ลานนี้ไม่มีพิกัด สแกนสติกเกอร์อย่างเดียวก็เช็คอินได้ (เหมาะกับในอาคารที่ GPS ไม่แม่น)'}
        </span>
      </span>
    </label>
  )
}

const LotSpots = ({ lot, onChanged }) => {
  const [spots, setSpots] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [newSpots, setNewSpots] = useState('')
  const [floor, setFloor] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await adminAPI.getLotSpots(lot.id)
      setSpots(data.spots)
    } catch (error) {
      toast.error(apiErrorMessage(error, 'โหลดช่องจอดไม่สำเร็จ'))
    } finally {
      setLoading(false)
    }
  }, [lot.id])

  useEffect(() => {
    load()
  }, [load])

  const toggle = async (spot) => {
    if (spot.status !== 'available' && spot.status !== 'closed') {
      toast.error(`ช่อง ${spot.spotNumber} ${spot.status === 'occupied' ? 'มีรถจอดอยู่' : 'ถูกจองอยู่'} ปิดไม่ได้ตอนนี้`)
      return
    }
    const closing = spot.status === 'available'
    setBusyId(spot.id)
    try {
      const { data } = await adminAPI.setSpotClosed(spot.id, closing)
      setSpots((list) => list.map((s) => (s.id === spot.id ? { ...s, status: data.spot.status } : s)))
      toast.success(data.message)
      onChanged()
    } catch (error) {
      toast.error(apiErrorMessage(error))
      load()
    } finally {
      setBusyId(null)
    }
  }

  const add = async (event) => {
    event.preventDefault()
    setAdding(true)
    try {
      const { data } = await adminAPI.addLotSpots(lot.id, { spots: newSpots, floor: floor.trim() || undefined })
      toast.success(data.message)
      setNewSpots('')
      load()
      onChanged()
    } catch (error) {
      toast.error(apiErrorMessage(error, 'เพิ่มช่องไม่สำเร็จ'))
    } finally {
      setAdding(false)
    }
  }

  return (
    <section className="bg-surface border border-hairline rounded-lg p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-h3 text-content">
          ช่องจอดของ {lot.zoneName} <span className="text-content-muted font-normal">· {lot.name}</span>
        </h3>
        <div className="flex flex-wrap gap-1.5" aria-label="คำอธิบายสี">
          {Object.entries(SPOT_STYLE).map(([key, { box, label }]) => (
            <span key={key} className={cn('inline-flex items-center h-6 px-2 rounded-sm border text-micro', box)}>
              {label}
            </span>
          ))}
        </div>
      </div>

      <StickerSwitch lot={lot} onChanged={onChanged} />

      <p className="text-small text-content-muted">
        กดที่ช่องว่างเพื่อปิดใช้งาน (เช่น ซ่อมพื้น หรือกันไว้สำหรับงาน) ช่องที่ปิดจะไม่ถูกจองและไม่นับในจำนวนช่องที่ผู้ใช้เห็น
        กดอีกครั้งเพื่อเปิด ช่องที่มีรถหรือถูกจองอยู่ปิดไม่ได้
      </p>

      {loading ? (
        <div className="py-8 grid place-items-center"><Spinner /></div>
      ) : spots.length === 0 ? (
        <EmptyState icon={ParkingSquare} title="ลานนี้ยังไม่มีช่องจอด" description="เพิ่มช่องด้านล่าง เช่น A01-A20" />
      ) : (
        <ul className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
          {spots.map((s) => {
            const style = SPOT_STYLE[s.status] || SPOT_STYLE.occupied
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => toggle(s)}
                  disabled={busyId === s.id}
                  title={[style.label, s.booking?.licensePlate].filter(Boolean).join(' · ')}
                  aria-label={`ช่อง ${s.spotNumber} ${style.label}${s.booking?.licensePlate ? ` ทะเบียน ${s.booking.licensePlate}` : ''}`}
                  className={cn(
                    'w-full h-14 rounded-md border flex flex-col items-center justify-center transition-opacity',
                    style.box,
                    busyId === s.id && 'opacity-50'
                  )}
                >
                  <span className="font-mono text-small font-semibold">{s.spotNumber}</span>
                  {s.booking?.licensePlate && (
                    <span className="text-[10px] leading-tight truncate max-w-full px-1 no-underline">{s.booking.licensePlate}</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={add} className="flex flex-wrap items-end gap-2 pt-2 border-t border-hairline">
        <div className="flex-1 min-w-[12rem]">
          <Input
            label="เพิ่มช่อง"
            placeholder="A01-A20, B1, B2"
            hint="ใส่เป็นช่วงหรือคั่นด้วยจุลภาค ช่องที่มีอยู่แล้วจะถูกข้าม"
            value={newSpots}
            onChange={(e) => setNewSpots(e.target.value)}
          />
        </div>
        <div className="w-32">
          <Input label="ชั้น" placeholder="ชั้น 1" value={floor} onChange={(e) => setFloor(e.target.value)} />
        </div>
        <Button type="submit" icon={Plus} loading={adding} disabled={!newSpots.trim()}>
          เพิ่ม
        </Button>
      </form>
    </section>
  )
}

const AdminLots = () => {
  const [view, setView] = useState('spots')
  const [lots, setLots] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const { data } = await adminAPI.getLots()
      setLots(data.lots)
      setSelectedId((id) => id || data.lots[0]?.id || null)
    } catch (error) {
      toast.error(apiErrorMessage(error, 'โหลดรายการลานไม่สำเร็จ'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const selected = lots.find((l) => l.id === selectedId)

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 rounded-md bg-surface-2 w-fit max-w-full overflow-x-auto" role="tablist">
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={cn(
              'h-9 px-4 rounded-sm inline-flex items-center gap-2 text-small font-medium whitespace-nowrap transition-colors duration-fast',
              view === id ? 'bg-surface text-content shadow-e1' : 'text-content-muted hover:text-content'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {view === 'gps' && <LotLocations onChange={load} />}
      {view === 'qr' && <SpotQrSheet />}

      {view === 'spots' &&
        (loading ? (
          <div className="py-10 grid place-items-center"><Spinner /></div>
        ) : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {lots.map((lot) => (
                <li key={lot.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(lot.id)}
                    aria-pressed={lot.id === selectedId}
                    className={cn(
                      'w-full text-left bg-surface border rounded-lg p-4 transition-colors duration-fast',
                      lot.id === selectedId ? 'border-brand-500 ring-1 ring-brand-500' : 'border-hairline hover:border-content-subtle'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-body font-semibold text-content">{lot.zoneName}</p>
                        <p className="text-small text-content-muted truncate">{lot.name}</p>
                      </div>
                      {lot.gpsCheckIn ? (
                        <Badge tone="ok" dot>GPS</Badge>
                      ) : (
                        <Badge tone="neutral">ไม่มีพิกัด</Badge>
                      )}
                    </div>
                    <p className="mt-3 text-small text-content-muted">
                      <span className="font-mono text-content tabular">{lot.spots.total}</span> ช่อง · ว่าง{' '}
                      <span className="font-mono text-content tabular">{lot.spots.available}</span>
                      {lot.spots.closed > 0 && (
                        <>
                          {' '}· ปิด <span className="font-mono text-content tabular">{lot.spots.closed}</span>
                        </>
                      )}
                    </p>
                  </button>
                </li>
              ))}
            </ul>

            {selected && <LotSpots key={selected.id} lot={selected} onChanged={load} />}

            <AddLotForm
              onAdded={(lot) => {
                setSelectedId(lot.id)
                load()
              }}
            />
          </>
        ))}
    </div>
  )
}

export default AdminLots
