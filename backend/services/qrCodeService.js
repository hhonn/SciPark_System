import QRCode from 'qrcode';
import crypto from 'crypto';

/**
 * QR check-in credentials.
 *
 * The QR image carries a random token; only its SHA-256 hash is persisted on
 * the booking. Check-in therefore proves possession of the code that was issued
 * for that specific booking, and a database dump cannot be replayed into a
 * check-in. Tokens die with the check-in deadline.
 */

const TOKEN_BYTES = 32;

export const hashToken = (token) =>
  crypto.createHash('sha256').update(String(token)).digest('hex');

/**
 * Compare two tokens without leaking their difference through timing.
 */
export const tokensMatch = (plainToken, storedHash) => {
  if (!plainToken || !storedHash) return false;
  const candidate = Buffer.from(hashToken(plainToken), 'hex');
  const expected = Buffer.from(String(storedHash), 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
};

/**
 * Issue a QR code for a booking.
 *
 * @returns {Promise<{ qrCodeDataURL: string, token: string, tokenHash: string, expiresAt: number }>}
 */
export const generateBookingQRCode = async (booking) => {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');

  const expiresAt = booking.checkInDeadline
    ? new Date(booking.checkInDeadline).getTime()
    : Date.now() + 24 * 60 * 60 * 1000;

  const qrPayload = {
    v: 1,
    bookingId: booking._id.toString(),
    token,
    expiresAt,
  };

  const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrPayload), {
    errorCorrectionLevel: 'H',
    type: 'image/png',
    margin: 1,
    color: { dark: '#000000', light: '#FFFFFF' },
    width: 400,
  });

  return { qrCodeDataURL, token, tokenHash: hashToken(token), expiresAt };
};

/**
 * Parse whatever the scanner sent us. Accepts the raw JSON payload from the QR
 * image or a bare token string, so a hardware scanner and the in-app button can
 * share one endpoint.
 *
 * @returns {{ token: string|null, bookingId: string|null, expiresAt: number|null }}
 */
export const parseScannedPayload = (raw) => {
  if (!raw) return { token: null, bookingId: null, expiresAt: null };

  if (typeof raw === 'object') {
    return {
      token: raw.token || null,
      bookingId: raw.bookingId || null,
      expiresAt: raw.expiresAt || null,
    };
  }

  const text = String(raw).trim();

  // A bare token is 64 hex characters.
  if (/^[0-9a-f]{64}$/i.test(text)) {
    return { token: text, bookingId: null, expiresAt: null };
  }

  try {
    const parsed = JSON.parse(text);
    return {
      token: parsed.token || null,
      bookingId: parsed.bookingId || null,
      expiresAt: parsed.expiresAt || null,
    };
  } catch {
    return { token: null, bookingId: null, expiresAt: null };
  }
};

/**
 * Validate a scan against a booking.
 *
 * @returns {{ valid: boolean, reason?: string }}
 */
export const verifyScan = (booking, storedHash, rawPayload) => {
  const { token, bookingId } = parseScannedPayload(rawPayload);

  if (!token) return { valid: false, reason: 'QR code ไม่ถูกต้อง' };
  if (bookingId && bookingId !== booking._id.toString()) {
    return { valid: false, reason: 'QR code นี้เป็นของการจองอื่น' };
  }
  if (!storedHash) return { valid: false, reason: 'การจองนี้ยังไม่มี QR code' };
  if (!tokensMatch(token, storedHash)) return { valid: false, reason: 'QR code ไม่ถูกต้องหรือถูกออกใหม่แล้ว' };
  if (booking.checkInDeadline && Date.now() > new Date(booking.checkInDeadline).getTime()) {
    return { valid: false, reason: 'QR code หมดอายุแล้ว' };
  }

  return { valid: true };
};

export default { generateBookingQRCode, verifyScan, parseScannedPayload, hashToken, tokensMatch };
