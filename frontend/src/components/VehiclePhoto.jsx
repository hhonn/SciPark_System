import { useRef, useState } from 'react'
import { Car, Camera } from 'lucide-react'
import toast from 'react-hot-toast'
import { uploadVehiclePhoto } from '../utils/upload'
import { apiErrorMessage } from '../utils/api'
import { cn } from '../utils/cn'

/**
 * The car's thumbnail. Tapping it picks a new photo, which goes to S3; staff
 * see it when they scan the driver's QR. Without S3 configured it is a plain
 * icon, as before.
 */
const VehiclePhoto = ({ vehicle, enabled, onUploaded }) => {
  const input = useRef(null)
  const [busy, setBusy] = useState(false)

  const pick = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const url = await uploadVehiclePhoto(vehicle.id, file)
      onUploaded?.(url)
      toast.success('บันทึกรูปรถแล้ว')
    } catch (error) {
      toast.error(error.response ? apiErrorMessage(error) : error.message)
    } finally {
      setBusy(false)
    }
  }

  const thumb = vehicle.photoUrl ? (
    <img src={vehicle.photoUrl} alt={`รูปรถ ${vehicle.licensePlate}`} className="w-full h-full object-cover" />
  ) : (
    <Car className="w-5 h-5 text-content-muted" />
  )

  if (!enabled) {
    return (
      <span className="w-11 h-11 rounded-md bg-surface-2 flex items-center justify-center shrink-0 overflow-hidden">
        {thumb}
      </span>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className={cn(
          'relative w-14 h-14 rounded-md bg-surface-2 flex items-center justify-center shrink-0 overflow-hidden',
          'ring-offset-2 focus-visible:ring-2 focus-visible:ring-brand-500',
          busy && 'opacity-60'
        )}
        aria-label={vehicle.photoUrl ? `เปลี่ยนรูปรถ ${vehicle.licensePlate}` : `เพิ่มรูปรถ ${vehicle.licensePlate}`}
        title="แตะเพื่อเพิ่มหรือเปลี่ยนรูปรถ"
      >
        {thumb}
        <span className="absolute bottom-0 right-0 m-0.5 w-5 h-5 rounded-full bg-surface/90 flex items-center justify-center">
          <Camera className="w-3 h-3 text-content-muted" />
        </span>
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={pick} />
    </>
  )
}

export default VehiclePhoto
