import { create } from 'zustand'

const STORAGE_KEY = 'scipark-theme'

const readStored = () => {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'dark' || value === 'light' ? value : 'system'
  } catch {
    // Private mode / blocked storage: fall back to the system preference.
    return 'system'
  }
}

const apply = (theme) => {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)

  try {
    if (theme === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* nothing to persist to; the in-memory value still drives this session */
  }
}

export const useThemeStore = create((set, get) => ({
  theme: readStored(),

  setTheme: (theme) => {
    apply(theme)
    set({ theme })
  },

  /** Cycles light -> dark -> system. */
  cycleTheme: () => {
    const order = ['light', 'dark', 'system']
    const next = order[(order.indexOf(get().theme) + 1) % order.length]
    get().setTheme(next)
  },
}))
