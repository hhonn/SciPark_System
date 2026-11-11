import { NavLink } from 'react-router-dom'
import { useNavItems } from './navItems'
import { useBookingStore } from '../../stores/bookingStore'
import { cn } from '../../utils/cn'

/** Persistent rail at lg+. Below that the TabBar takes over. */
const SideNav = () => {
  const activeBooking = useBookingStore((s) => s.activeBooking)
  const items = useNavItems()

  return (
    <nav className="hidden lg:block w-56 shrink-0 py-6" aria-label="เมนูหลัก">
      <div className="sticky top-[calc(theme(spacing.topbar)+1.5rem)] space-y-1">
        {items.map(({ to, label, icon: Icon, end, badgeKey }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 h-11 px-3 rounded-md text-small font-medium',
                'transition-colors duration-fast ease-out',
                isActive
                  ? 'bg-brand-500/10 text-brand-600'
                  : 'text-content-muted hover:bg-surface-2 hover:text-content'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('w-[18px] h-[18px]', isActive && 'text-brand-500')} />
                <span className="flex-1">{label}</span>
                {badgeKey === 'activeBooking' && activeBooking && (
                  <span className="w-2 h-2 rounded-full bg-warn" aria-label="มีการจองที่ใช้งานอยู่" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export default SideNav
