import { vehicleAPI } from './apiService'

/**
 * Shrink a photo in the browser before it is uploaded: a phone camera's 4–8 MB
 * JPEG becomes ~200 KB, which is faster on mobile data and cheaper to store.
 */
export const resizeImage = (file, maxSide = 1280, quality = 0.85) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('resize failed'))), 'image/jpeg', quality)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('ไฟล์นี้ไม่ใช่รูปภาพที่อ่านได้'))
    }
    img.src = url
  })

/**
 * Upload a car photo straight to S3, then tell the API to attach it.
 *
 * The file never goes through our servers: the API only signs a one-time POST
 * (one key, one content type, size-capped) and verifies the result.
 */
export const uploadVehiclePhoto = async (vehicleId, file) => {
  const blob = await resizeImage(file)
  const { data } = await vehicleAPI.requestPhotoUpload(vehicleId, 'image/jpeg')
  const { url, fields, key } = data.upload

  const form = new FormData()
  Object.entries(fields).forEach(([name, value]) => form.append(name, value))
  form.append('file', blob, 'photo.jpg') // must be the last field

  const res = await fetch(url, { method: 'POST', body: form })
  if (!res.ok) throw new Error('อัปโหลดไป S3 ไม่สำเร็จ')

  const confirmed = await vehicleAPI.confirmPhoto(vehicleId, key)
  return confirmed.data.photoUrl
}

export default { resizeImage, uploadVehiclePhoto }
