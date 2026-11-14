import { create } from 'zustand'

// Live booking state.
//
// Deliberately not persisted. The old store wrote the active booking to
// localStorage, so a booking that had since been auto-cancelled server-side
// kept showing as active, countdown and all, until the user hit
// refresh. The server is the only authority on booking state.
//
// The QR token is no longer kept here: the user's own app never submits it.
// It lives only in the QR image, for a staff member to scan.
export const useBookingStore = create((set) => ({
  activeBooking: null,
  loading: false,

  setActiveBooking: (booking) => set({ activeBooking: booking }),
  setLoading: (loading) => set({ loading }),

  clearActiveBooking: () => set({ activeBooking: null }),
}))
