/**
 * One high-accuracy GPS fix, as a promise.
 *
 * `maximumAge: 0` matters: a cached position from earlier (say, at home) must
 * never be what decides whether someone is standing in the lot.
 * `overrides` adjusts the options, e.g. a shorter timeout where GPS is optional.
 */
export const getPosition = (overrides = {}) =>
  new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(Object.assign(new Error('unsupported'), { code: 'unsupported' }))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
      ...overrides,
    })
  })

/** Turn a GeolocationPositionError into something a driver can act on. */
export const geolocationErrorMessage = (error) => {
  if (error?.code === 'unsupported') return 'เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง กรุณาสแกน QR ที่ช่องจอด'
  if (error?.code === 1) return 'กรุณาอนุญาตให้เว็บเข้าถึงตำแหน่ง (Location) ในการตั้งค่าเบราว์เซอร์ แล้วลองใหม่'
  if (error?.code === 3) return 'หาตำแหน่งไม่ทันเวลา ลองออกที่โล่งแล้วกดใหม่'
  return 'ระบุตำแหน่งไม่ได้ ลองใหม่อีกครั้ง หรือสแกน QR ที่ช่องจอด'
}

export default { getPosition, geolocationErrorMessage }
