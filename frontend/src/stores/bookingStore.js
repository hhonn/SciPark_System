import { create } from 'zustand'

/**
 * Live booking state.
 *
 * Deliberately NOT persisted. The old store wrote the active booking to
 * localStorage, so a booking that had since been auto-cancelled server-side
 * kept showing as active — complete with a countdown — until the user hit
 * refresh. The server is the only authority on booking state.
 */
export const useBookingStore = create((set) => ({
  activeBooking: null,
  /** Plain QR token, held in memory for the length of the session only. */
  qrToken: null,
  loading: false,

  setActiveBooking: (booking) => set({ activeBooking: booking }),
  setQrToken: (qrToken) => set({ qrToken }),
  setLoading: (loading) => set({ loading }),

  clearActiveBooking: () => set({ activeBooking: null, qrToken: null }),
}))
