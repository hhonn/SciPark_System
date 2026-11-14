import { LayoutGrid, Ticket, Crown, UserRound, ScanLine, Gauge, ClipboardList, ParkingSquare, Users } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'

// One nav definition drives the desktop rail and the mobile tab bar, so the
// two can never drift apart.
export const NAV_ITEMS = [
  // Drivers. An admin account runs the system rather than parks, so these
  // are hidden for it (test the driver side with a normal account).
  { to: '/app', label: 'ค้นหาที่จอด', short: 'ที่จอด', icon: LayoutGrid, end: true, driverOnly: true },
  { to: '/app/booking', label: 'การจองของฉัน', short: 'การจอง', icon: Ticket, badgeKey: 'activeBooking', driverOnly: true },
  { to: '/app/privileges', label: 'สิทธิพิเศษ', short: 'สิทธิพิเศษ', icon: Crown, driverOnly: true },
  // Admins.
  { to: '/app/admin', label: 'แดชบอร์ด', short: 'แดชบอร์ด', icon: Gauge, end: true, adminOnly: true },
  { to: '/app/admin/bookings', label: 'การจอง', short: 'การจอง', icon: ClipboardList, adminOnly: true },
  { to: '/app/admin/lots', label: 'ลานและช่องจอด', short: 'ลานจอด', icon: ParkingSquare, adminOnly: true },
  { to: '/app/admin/users', label: 'ผู้ใช้', short: 'ผู้ใช้', icon: Users, adminOnly: true },
  // Everyone.
  { to: '/app/profile', label: 'โปรไฟล์', short: 'โปรไฟล์', icon: UserRound },
  // Parking staff only. Lots have no staff today, so most accounts never see it.
  { to: '/app/staff', label: 'สแกนเช็คอิน', short: 'สแกน', icon: ScanLine, staffOnly: true },
]

// Staff and admins can scan; everyone else never sees the entry.
export const canScan = (user) => Boolean(user?.isStaff || user?.isAdmin)

export const isAdminUser = (user) => Boolean(user?.isAdmin)

// The nav items this user should see.
export const useNavItems = () => {
  const user = useAuthStore((s) => s.user)
  const admin = isAdminUser(user)
  return NAV_ITEMS.filter(
    (item) =>
      (!item.adminOnly || admin) &&
      (!item.driverOnly || !admin) &&
      (!item.staffOnly || Boolean(user?.isStaff))
  )
}
