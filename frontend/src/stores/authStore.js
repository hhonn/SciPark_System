import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: (userData, token = null) =>
        set({ user: userData, token, isAuthenticated: true }),

      logout: () => set({ user: null, token: null, isAuthenticated: false }),

      updateUser: (userData) => set({ user: { ...get().user, ...userData } }),

      setToken: (token) => set({ token }),
    }),
    {
      name: 'auth-storage',
      // Never persist a half-written session: if the token is gone the user is
      // not authenticated, whatever the stored flag said.
      onRehydrateStorage: () => (state) => {
        if (state && !state.token) {
          state.user = null
          state.isAuthenticated = false
        }
      },
    }
  )
)
