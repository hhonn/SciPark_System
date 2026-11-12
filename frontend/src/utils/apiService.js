import api from './api'

/**
 * Typed wrapper over the REST API.
 *
 * Every entry below is backed by a real route in backend/routes. The previous
 * version exported four endpoints the server never implemented
 * (`/parking/zones/:id/spots`, `/parking/spots/:id/availability`,
 * `/privileges/promos`, `/bookings/:id/extend`), so any screen that called them
 * failed with a 404 that surfaced as a generic error toast.
 */

export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  sendVerifyOTP: () => api.post('/auth/send-verify-otp'),
  verifyAccount: (otp) => api.post('/auth/verify-account', { otp }),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: ({ email, otp, newPassword }) => api.post('/auth/reset-password', { email, otp, newPassword }),
}

export const pointsAPI = {
  get: () => api.get('/points'),
  redeem: (rewardId) => api.post('/points/redeem', { rewardId }),
}

/** Operators only (the API enforces it). */
export const adminAPI = {
  getBookings: (params) => api.get('/admin/bookings', { params }),
  cancelBooking: (id, note) => api.post(`/admin/bookings/${id}/cancel`, { note }),
  forceCheckout: (id, note) => api.post(`/admin/bookings/${id}/force-checkout`, { note }),
  getUsers: (params) => api.get('/admin/users', { params }),
  setStaff: (id, isStaff) => api.put(`/admin/users/${id}/staff`, { isStaff }),
  // Codes for the QR stickers on the bays of a lot, and replacing one.
  getSpotCodes: (zoneId) => api.get('/admin/spot-codes', { params: { zone: zoneId || undefined } }),
  rotateSpotCode: (spotId) => api.post(`/admin/spots/${spotId}/rotate-code`),
}

export const pricingAPI = {
  // Public: fees and tiers are quoted on the landing and legal pages too.
  get: () => api.get('/pricing'),
}

export const parkingAPI = {
  getZones: () => api.get('/parking/zones'),
  getZoneById: (id) => api.get(`/parking/zones/${id}`),
  getSpotsByZone: (zoneId, params) => api.get(`/parking/zones/${zoneId}/spots`, { params }),
  getAllSpots: (params) => api.get('/parking/spots', { params }),
  getSpotById: (id) => api.get(`/parking/spots/${id}`),
  getStats: () => api.get('/parking/stats'),
}

export const bookingAPI = {
  createBooking: (payload) => api.post('/bookings', payload),
  getActiveBooking: () => api.get('/bookings/active'),
  getHistory: (params) => api.get('/bookings/history', { params }),
  getQRCode: (bookingId) => api.get(`/bookings/${bookingId}/qr`),
  cancelBooking: (bookingId) => api.delete(`/bookings/${bookingId}`),
  // Self check-in by GPS: the phone's fix is the proof of arrival.
  checkIn: (bookingId, { latitude, longitude, accuracy }) =>
    api.put(`/bookings/${bookingId}/checkin`, { latitude, longitude, accuracy }),
  // The QR sticker on a bay: read it (changes nothing), then check in with it.
  // The GPS fields are optional here.
  scanSpot: ({ spotId, code }) => api.post('/bookings/spot-scan', { spotId, code }),
  checkInAtSpot: (bookingId, { spotId, code, latitude, longitude, accuracy }) =>
    api.put(`/bookings/${bookingId}/checkin`, { spotId, code, latitude, longitude, accuracy }),
  checkOut: (bookingId, paymentMethodId) =>
    api.put(`/bookings/${bookingId}/checkout`, { paymentMethodId }),
}

/** Parking staff and admins. */
export const staffAPI = {
  scan: (qrPayload) => api.post('/staff/scan', { qrPayload }),
  getZones: () => api.get('/staff/zones'),
  // Admin only: pin a lot to where the admin is standing (or clear it).
  setZoneLocation: (zoneId, body) => api.put(`/staff/zones/${zoneId}/location`, body),
}

export const privilegesAPI = {
  getTiers: () => api.get('/privileges'),
  subscribe: (tierId, paymentMethodId) =>
    api.post('/privileges/subscribe', { tierId, paymentMethodId }),
  redeemCode: (code) => api.post('/privileges/redeem', { code }),
}

export const vehicleAPI = {
  getAll: () => api.get('/vehicles'),
  create: (vehicleData) => api.post('/vehicles', vehicleData),
  update: (id, vehicleData) => api.put(`/vehicles/${id}`, vehicleData),
  delete: (id) => api.delete(`/vehicles/${id}`),
  setDefault: (id) => api.put(`/vehicles/${id}/default`),
  // Car photo in S3: sign an upload, then confirm it.
  requestPhotoUpload: (id, contentType) => api.post(`/vehicles/${id}/photo/upload`, { contentType }),
  confirmPhoto: (id, key) => api.put(`/vehicles/${id}/photo`, { key }),
  removePhoto: (id) => api.delete(`/vehicles/${id}/photo`),
}

export const paymentAPI = {
  getAll: () => api.get('/payment-methods'),
  create: (data) => api.post('/payment-methods', data),
  update: (id, data) => api.put(`/payment-methods/${id}`, data),
  delete: (id) => api.delete(`/payment-methods/${id}`),
  setDefault: (id) => api.put(`/payment-methods/${id}/default`),
}

export const notificationAPI = {
  getAll: (params) => api.get('/notifications', { params }),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markAsRead: (id) => api.put(`/notifications/${id}/read`),
  markAllAsRead: () => api.put('/notifications/read-all'),
  remove: (id) => api.delete(`/notifications/${id}`),
  removeAll: () => api.delete('/notifications'),
}

export const userAPI = {
  getProfile: () => api.get('/user/profile'),
  updateProfile: (userData) => api.put('/user/profile', userData),
  changePassword: (passwords) => api.put('/user/change-password', passwords),
  getBookingHistory: (params) => api.get('/user/bookings', { params }),
  getStats: () => api.get('/user/stats'),
}
