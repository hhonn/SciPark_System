/**
 * The QR sticker on each parking bay.
 *
 * It holds a plain link, /app/arrive?s=<bay id>&c=<code>, so it works two ways:
 * the phone's own camera app opens the link, or the in-app scanner reads it.
 * Either way the driver lands on the arrive page and confirms there.
 */

export const ARRIVE_PATH = '/app/arrive'

/** The link printed on a bay's sticker. */
export const spotQrUrl = (origin, spotId, code) => {
  const params = new URLSearchParams({ s: String(spotId), c: code })
  return `${origin}${ARRIVE_PATH}?${params}`
}

/**
 * Read a scanned sticker. Returns { spotId, code }, or null when the QR is not
 * one of ours (for example the driver's own booking QR, or some other code).
 */
export const parseSpotQr = (text) => {
  try {
    const url = new URL(String(text).trim())
    if (url.pathname !== ARRIVE_PATH) return null
    const spotId = url.searchParams.get('s')
    const code = url.searchParams.get('c')
    return spotId && code ? { spotId, code } : null
  } catch {
    return null
  }
}

export default { ARRIVE_PATH, spotQrUrl, parseSpotQr }
