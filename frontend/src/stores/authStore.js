import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Who is signed in.
//
// The session itself lives in an httpOnly cookie the browser sends on its own.
// The JWT used to be copied in here and persisted to localStorage, where any
// injected script could read it. That threw away the protection the
// httpOnly cookie exists to give. Only the profile is remembered now, so the
// UI can render instantly; App re-checks the session with /auth/me on load.
export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,

      login: (userData) => set({ user: userData, isAuthenticated: true }),

      logout: () => set({ user: null, isAuthenticated: false }),

      updateUser: (userData) => set({ user: { ...get().user, ...userData } }),
    }),
    {
      name: 'auth-storage',
      version: 1,
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
      // v0 stored the raw token; drop it from anyone's existing localStorage.
      migrate: (persisted) => ({
        user: persisted?.user ?? null,
        isAuthenticated: Boolean(persisted?.isAuthenticated && persisted?.user),
      }),
    }
  )
)
