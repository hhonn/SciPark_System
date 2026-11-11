import { NavLink } from 'react-router-dom'
import { useNavItems } from './navItems'
import { useBookingStore } from '../../stores/bookingStore'
import { cn } from '../../utils/cn'

/**
 * Mobile bottom navigation.
 *
 * Sits in its own fixed element rather than nested inside the header, and the
 * page reserves matching padding so it never covers the last row of content.
 */
const TabBar = () => {
  const activeBooking = useBookingStore((s) => s.activeBooking)
  // At most five fit a phone; the admin screen is reached from the scanner page.
  const items = useNavItems().filter((item) => !item.adminOnly)

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-surface/95 backdrop-blur-xl border-t border-hairline"
      aria-label="เมนูหลัก"
    >
      <div
        className={cn(
          'grid px-2 pb-[env(safe-area-inset-bottom,0px)]',
          items.length > 4 ? 'grid-cols-5' : 'grid-cols-4'
        )}
      >
        {items.map(({ to, short, icon: Icon, end, badgeKey }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'relative flex flex-col items-center justify-center gap-1 h-tabbar rounded-md',
                'transition-colors duration-fast',
                isActive ? 'text-brand-600' : 'text-content-subtle'
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative">
                  <Icon className="w-[22px] h-[22px]" />
                  {badgeKey === 'activeBooking' && activeBooking && (
                    <span
                      className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-warn ring-2 ring-surface"
                      aria-label="มีการจองที่ใช้งานอยู่"
                    />
                  )}
                </span>
                <span className="text-micro font-medium">{short}</span>
                {isActive && (
                  <span className="absolute top-0 inset-x-4 h-0.5 rounded-full bg-brand-500" aria-hidden="true" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export default TabBar
