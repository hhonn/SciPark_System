// One high-accuracy GPS fix, as a promise.
//
// `maximumAge: 0` matters: a cached position from earlier (say, at home) must
// never be what decides whether someone is standing in the lot.
// `overrides` adjusts the options, e.g. a shorter timeout where GPS is optional.
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

// Turn a GeolocationPositionError into something a driver can act on.
export const geolocationErrorMessage = (error) => {
  if (error?.code === 'unsupported') return 'เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง กรุณาสแกน QR ที่ช่องจอด'
  if (error?.code === 1) return 'กรุณาอนุญาตให้เว็บเข้าถึงตำแหน่ง (Location) ในการตั้งค่าเบราว์เซอร์ แล้วลองใหม่'
  if (error?.code === 3) return 'หาตำแหน่งไม่ทันเวลา ลองออกที่โล่งแล้วกดใหม่'
  return 'ระบุตำแหน่งไม่ได้ ลองใหม่อีกครั้ง หรือสแกน QR ที่ช่องจอด'
}

// Coordinates pasted by an admin: "13.7299, 100.7782" as Google Maps copies
// them (right-click a point, click the numbers), or a Maps link that has
// "@13.7299,100.7782" or "q=13.7299,100.7782" in it.
//
// @returns {{ latitude: number, longitude: number } | null}
export const parseCoordinates = (text) => {
  const match = /(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/.exec(String(text || ''))
  if (!match) return null
  const latitude = Number(match[1])
  const longitude = Number(match[2])
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
  return { latitude, longitude }
}

export default { getPosition, geolocationErrorMessage, parseCoordinates }
