import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import toast from 'react-hot-toast'
import TopBar from './TopBar'
import TabBar from './TabBar'
import SideNav from './SideNav'
import { useAuthStore } from '../../stores/authStore'

const Layout = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const logout = useAuthStore((s) => s.logout)

  // The API client raises this instead of hard-reloading the page, so an
  // expired session lands on /login with the SPA still alive.
  useEffect(() => {
    const onExpired = () => {
      logout()
      toast.error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง')
      navigate('/login', { replace: true })
    }

    window.addEventListener('scipark:session-expired', onExpired)
    return () => window.removeEventListener('scipark:session-expired', onExpired)
  }, [logout, navigate])

  // Land at the top of each new screen rather than keeping the old scroll.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
  }, [location.pathname, reduce])

  return (
    <div className="min-h-screen bg-canvas">
      <TopBar />

      <div className="app-gutter flex gap-8 pt-topbar">
        <SideNav />

        <main className="flex-1 min-w-0 py-6 pb-[calc(theme(spacing.tabbar)+2rem)] lg:pb-10">
          <motion.div
            key={location.pathname}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 0.8, 0.29, 1] }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>

      <TabBar />
    </div>
  )
}

export default Layout
