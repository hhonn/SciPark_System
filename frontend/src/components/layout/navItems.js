import { LayoutGrid, Ticket, Crown, UserRound } from 'lucide-react'

/**
 * One nav definition drives the desktop rail and the mobile tab bar, so the
 * two can never drift apart.
 */
export const NAV_ITEMS = [
  { to: '/app', label: 'ค้นหาที่จอด', short: 'ที่จอด', icon: LayoutGrid, end: true },
  { to: '/app/booking', label: 'การจองของฉัน', short: 'การจอง', icon: Ticket, badgeKey: 'activeBooking' },
  { to: '/app/privileges', label: 'สิทธิพิเศษ', short: 'สิทธิพิเศษ', icon: Crown },
  { to: '/app/profile', label: 'โปรไฟล์', short: 'โปรไฟล์', icon: UserRound },
]
