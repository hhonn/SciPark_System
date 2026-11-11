/**
 * One high-accuracy GPS fix, as a promise.
 *
 * `maximumAge: 0` matters: a cached position from earlier (say, at home) must
 * never be what decides whether someone is standing in the lot.
 */
export const getPosition = () =>
  new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(Object.assign(new Error('unsupported'), { code: 'unsupported' }))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    })
  })

/** Turn a GeolocationPositionError into something a driver can act on. */
export const geolocationErrorMessage = (error) => {
  if (error?.code === 'unsupported') return 'เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง กรุณาให้เจ้าหน้าที่สแกน QR'
  if (error?.code === 1) return 'กรุณาอนุญาตให้เว็บเข้าถึงตำแหน่ง (Location) ในการตั้งค่าเบราว์เซอร์ แล้วลองใหม่'
  if (error?.code === 3) return 'หาตำแหน่งไม่ทันเวลา ลองออกที่โล่งแล้วกดใหม่'
  return 'ระบุตำแหน่งไม่ได้ ลองใหม่อีกครั้ง หรือให้เจ้าหน้าที่สแกน QR'
}

export default { getPosition, geolocationErrorMessage }
