import { cn } from '../../utils/cn'

/**
 * Shown when a list is legitimately empty. Always offers the next action —
 * an empty screen with no way forward is a dead end.
 */
const EmptyState = ({ icon: Icon, title, description, action, className }) => (
  <div className={cn('flex flex-col items-center text-center py-12 px-6', className)}>
    {Icon && (
      <div className="w-14 h-14 rounded-xl bg-surface-2 border border-hairline flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-content-subtle" aria-hidden="true" />
      </div>
    )}
    <h3 className="text-h3 text-content">{title}</h3>
    {description && <p className="mt-1.5 text-small text-content-muted max-w-sm">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
)

export default EmptyState
