import { LayoutGrid, Ticket, Crown, UserRound, ScanLine, ShieldCheck } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'

/**
 * One nav definition drives the desktop rail and the mobile tab bar, so the
 * two can never drift apart.
 */
export const NAV_ITEMS = [
  { to: '/app', label: 'ค้นหาที่จอด', short: 'ที่จอด', icon: LayoutGrid, end: true },
  { to: '/app/booking', label: 'การจองของฉัน', short: 'การจอง', icon: Ticket, badgeKey: 'activeBooking' },
  { to: '/app/privileges', label: 'สิทธิพิเศษ', short: 'สิทธิพิเศษ', icon: Crown },
  { to: '/app/profile', label: 'โปรไฟล์', short: 'โปรไฟล์', icon: UserRound },
  { to: '/app/staff', label: 'สแกนเช็คอิน', short: 'สแกน', icon: ScanLine, staffOnly: true },
  { to: '/app/admin', label: 'ผู้ดูแลระบบ', short: 'แอดมิน', icon: ShieldCheck, adminOnly: true },
]

/** Staff and admins can scan; everyone else never sees the entry. */
export const canScan = (user) => Boolean(user?.isStaff || user?.isAdmin)

export const isAdminUser = (user) => Boolean(user?.isAdmin)

/** The nav items this user should see. */
export const useNavItems = () => {
  const user = useAuthStore((s) => s.user)
  return NAV_ITEMS.filter(
    (item) => (!item.staffOnly || canScan(user)) && (!item.adminOnly || isAdminUser(user))
  )
}
