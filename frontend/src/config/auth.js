/**
 * Account rules, mirrored from `backend/config/auth.js`.
 *
 * These are validation rules, not data: the server is the one that enforces
 * them, and this copy only exists so the user is told before the round trip
 * rather than after it. It was previously declared in Register.jsx and typed
 * again as a bare `8` in Profile.jsx, so the two screens could disagree about
 * what a valid password was.
 *
 * `npm run smoke` asserts this file still matches the backend.
 */
export const MIN_PASSWORD_LENGTH = 8

export default { MIN_PASSWORD_LENGTH }
