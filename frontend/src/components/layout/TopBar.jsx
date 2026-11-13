import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { Sun, Moon, Monitor, LogOut, User, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../stores/authStore'
import { useThemeStore } from '../../stores/themeStore'
import NotificationBell from '../NotificationBell'
import Logo from '../Logo'
import Button from '../ui/Button'
import Badge from '../ui/Badge'
import { cn } from '../../utils/cn'
import { authAPI } from '../../utils/apiService'

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor }
const THEME_LABEL = { light: 'ธีมสว่าง', dark: 'ธีมมืด', system: 'ตามระบบ' }

const RANK_TONE = { Iron: 'neutral', Diamond: 'brand', Predator: 'warn' }

const TopBar = () => {
  const { user, logout } = useAuthStore()
  const { theme, cycleTheme } = useThemeStore()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const triggerRef = useRef(null)

  // The dropdown could only be dismissed by clicking away: Escape did
  // nothing, and closing it left focus on a button that no longer had a
  // menu, so keyboard users lost their place in the header.
  useEffect(() => {
    if (!menuOpen) return undefined

    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  const ThemeIcon = THEME_ICON[theme]

  const handleLogout = async () => {
    // Clear locally even if the network call fails: the user asked to leave.
    try {
      await authAPI.logout()
    } catch {
      /* the cookie is cleared client-side below regardless */
    }
    logout()
    setMenuOpen(false)
    toast.success('ออกจากระบบแล้ว')
    navigate('/', { replace: true })
  }

  return (
    <header className="fixed top-0 inset-x-0 z-50 h-topbar bg-surface/85 backdrop-blur-xl border-b border-hairline">
      <div className="app-gutter h-full flex items-center justify-between gap-4">
        <Link to="/app" className="flex items-center gap-2.5 rounded-md" aria-label="SciPark หน้าหลัก">
          <Logo className="w-9 h-9" />
          <span className="text-h3 font-semibold tracking-tight hidden sm:block">SciPark - BY HONN</span>
        </Link>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={cycleTheme}
            aria-label={`สลับธีม (ปัจจุบัน: ${THEME_LABEL[theme]})`}
            title={THEME_LABEL[theme]}
          >
            <ThemeIcon className="w-5 h-5" />
          </Button>

          <NotificationBell />

          <div className="relative">
            <button
              ref={triggerRef}
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex items-center gap-2 h-11 pl-1.5 pr-2 rounded-md hover:bg-surface-2 transition-colors duration-fast"
            >
              <span className="w-8 h-8 rounded-full bg-brand-500/12 text-brand-600 flex items-center justify-center font-semibold text-small">
                {user?.name?.trim()?.charAt(0)?.toUpperCase() || <User className="w-4 h-4" />}
              </span>
              <span className="hidden md:block text-left leading-tight">
                <span className="block text-small font-medium text-content max-w-[9rem] truncate">
                  {user?.name || 'ผู้ใช้'}
                </span>
                <span className="block text-micro text-content-subtle">{user?.rank || 'Iron'}</span>
              </span>
              <ChevronDown
                className={cn(
                  'w-4 h-4 text-content-subtle transition-transform duration-fast hidden md:block',
                  menuOpen && 'rotate-180'
                )}
              />
            </button>

            {menuOpen && (
              <>
                {/* Click-away layer; keeps the menu from trapping the page. */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => {
                    setMenuOpen(false)
                    triggerRef.current?.focus()
                  }}
                  aria-hidden="true"
                />

                <div
                  role="menu"
                  className="absolute right-0 top-[calc(100%+8px)] z-20 w-60 bg-surface border border-hairline rounded-lg shadow-e3 overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-hairline">
                    <p className="text-small font-medium text-content truncate">{user?.name}</p>
                    <p className="text-micro text-content-subtle truncate">{user?.email}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge tone={RANK_TONE[user?.rank] || 'neutral'} dot>
                        {user?.rank || 'Iron'}
                      </Badge>
                      <span className="text-micro text-content-subtle tabular">
                        {user?.points ?? 0} แต้ม
                      </span>
                    </div>
                  </div>

                  <Link
                    to="/app/profile"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-small hover:bg-surface-2 transition-colors duration-fast"
                  >
                    <User className="w-4 h-4 text-content-subtle" />
                    โปรไฟล์และยานพาหนะ
                  </Link>

                  <button
                    role="menuitem"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 text-small text-risk hover:bg-risk/8 transition-colors duration-fast"
                  >
                    <LogOut className="w-4 h-4" />
                    ออกจากระบบ
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

export default TopBar
