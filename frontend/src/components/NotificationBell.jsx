import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Bell, CheckCheck, Trash2, Inbox } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../stores/authStore'
import { notificationAPI } from '../utils/apiService'
import { apiErrorMessage } from '../utils/api'
import Button from './ui/Button'
import EmptyState from './ui/EmptyState'
import { Spinner } from './ui/Loading'
import { cn } from '../utils/cn'

const POLL_INTERVAL = 60_000

/** Icon glyph per notification type — meaning at a glance in a long list. */
const TYPE_STYLE = {
  booking_created: 'bg-brand-500/12 text-brand-600',
  checkin_success: 'bg-ok/12 text-ok',
  checkout_success: 'bg-ok/12 text-ok',
  booking_reminder: 'bg-warn/12 text-warn',
  booking_cancelled: 'bg-risk/12 text-risk',
  payment_summary: 'bg-brand-500/12 text-brand-600',
  promo_new: 'bg-warn/12 text-warn',
  rank_upgrade: 'bg-warn/12 text-warn',
  system_announcement: 'bg-surface-2 text-content-muted',
}

const relativeTime = (value) => {
  const diff = Date.now() - new Date(value).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'เมื่อสักครู่'
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ชม.ที่แล้ว`
  return `${Math.floor(hours / 24)} วันที่แล้ว`
}

const NotificationBell = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const reduce = useReducedMotion()

  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef(null)
  const triggerRef = useRef(null)

  const fetchUnread = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const { data } = await notificationAPI.getUnreadCount()
      setUnread(data?.data?.unreadCount ?? 0)
    } catch {
      /* a failed badge poll is not worth interrupting the user for */
    }
  }, [isAuthenticated])

  const fetchList = useCallback(async () => {
    if (!isAuthenticated) return
    setLoading(true)
    try {
      const { data } = await notificationAPI.getAll({ limit: 20 })
      setItems(data?.data?.notifications ?? [])
      setUnread(data?.data?.unreadCount ?? 0)
    } catch (error) {
      toast.error(apiErrorMessage(error, 'โหลดการแจ้งเตือนไม่สำเร็จ'))
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  // Poll the badge only; the list is fetched when the panel opens.
  useEffect(() => {
    if (!isAuthenticated) {
      setItems([])
      setUnread(0)
      return undefined
    }

    fetchUnread()
    const id = window.setInterval(fetchUnread, POLL_INTERVAL)
    return () => window.clearInterval(id)
  }, [isAuthenticated, fetchUnread])

  useEffect(() => {
    if (open) fetchList()
  }, [open, fetchList])

  // Escape closed the panel but left focus on a trigger whose panel was gone,
  // so a keyboard user had no idea where they were. Same handling as the
  // account menu beside it.
  useEffect(() => {
    if (!open) return undefined

    const onKey = (e) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const markOne = async (id) => {
    // Optimistic: the list updates immediately, the request confirms it.
    setItems((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)))
    setUnread((c) => Math.max(0, c - 1))
    try {
      await notificationAPI.markAsRead(id)
    } catch {
      fetchList()
    }
  }

  const markAll = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })))
    setUnread(0)
    try {
      await notificationAPI.markAllAsRead()
    } catch (error) {
      toast.error(apiErrorMessage(error))
      fetchList()
    }
  }

  const clearAll = async () => {
    const snapshot = items
    setItems([])
    setUnread(0)
    try {
      await notificationAPI.removeAll()
      toast.success('ล้างการแจ้งเตือนแล้ว')
    } catch (error) {
      setItems(snapshot)
      toast.error(apiErrorMessage(error))
    }
  }

  if (!isAuthenticated) return null

  return (
    <div className="relative">
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `การแจ้งเตือน ${unread} รายการที่ยังไม่อ่าน` : 'การแจ้งเตือน'}
        aria-expanded={open}
      >
        <span className="relative">
          <Bell className="w-5 h-5" />
          {unread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-risk text-white text-[10px] font-bold flex items-center justify-center tabular ring-2 ring-surface">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </span>
      </Button>

      <AnimatePresence>
        {open && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => {
                setOpen(false)
                triggerRef.current?.focus()
              }}
              aria-hidden="true"
            />

            <motion.div
              ref={panelRef}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.16, ease: [0.22, 0.8, 0.29, 1] }}
              className="absolute right-0 top-[calc(100%+8px)] z-20 w-[min(22rem,calc(100vw-2rem))] bg-surface border border-hairline rounded-lg shadow-e3 overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
                <h2 className="text-small font-semibold">การแจ้งเตือน</h2>
                {items.length > 0 && (
                  <div className="flex items-center gap-1">
                    {unread > 0 && (
                      <Button variant="ghost" size="sm" onClick={markAll} icon={CheckCheck}>
                        อ่านทั้งหมด
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearAll}
                      aria-label="ล้างทั้งหมด"
                      className="text-risk hover:text-risk"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="max-h-[26rem] overflow-y-auto">
                {loading ? (
                  <div className="flex justify-center py-10">
                    <Spinner className="w-6 h-6" />
                  </div>
                ) : items.length === 0 ? (
                  <EmptyState
                    icon={Inbox}
                    title="ยังไม่มีการแจ้งเตือน"
                    description="เมื่อมีการจอง เช็คอิน หรือโปรโมชั่นใหม่ จะแจ้งที่นี่"
                    className="py-8"
                  />
                ) : (
                  <ul className="divide-y divide-hairline">
                    {items.map((item) => (
                      <li key={item._id}>
                        <button
                          onClick={() => !item.isRead && markOne(item._id)}
                          className={cn(
                            'w-full text-left flex gap-3 px-4 py-3 transition-colors duration-fast hover:bg-surface-2',
                            !item.isRead && 'bg-brand-500/[0.04]'
                          )}
                        >
                          <span
                            className={cn(
                              'w-9 h-9 rounded-md flex items-center justify-center shrink-0 mt-0.5',
                              TYPE_STYLE[item.type] || TYPE_STYLE.system_announcement
                            )}
                            aria-hidden="true"
                          >
                            <Bell className="w-4 h-4" />
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="flex items-start gap-2">
                              <span className="flex-1 text-small font-medium text-content">
                                {item.title}
                              </span>
                              {!item.isRead && (
                                <span
                                  className="w-2 h-2 rounded-full bg-brand-500 shrink-0 mt-1.5"
                                  aria-label="ยังไม่อ่าน"
                                />
                              )}
                            </span>
                            <span className="block text-small text-content-muted mt-0.5">
                              {item.message}
                            </span>
                            <span className="block text-micro text-content-subtle mt-1">
                              {relativeTime(item.createdAt)}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

export default NotificationBell
