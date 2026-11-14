import { Loader2 } from 'lucide-react'
import { cn } from '../../utils/cn'

export const Spinner = ({ className }) => (
  <Loader2 className={cn('animate-spin text-brand-500', className)} aria-hidden="true" />
)

// Full-page loading state.
export const PageLoader = ({ label = 'กำลังโหลด...' }) => (
  <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3" role="status">
    <Spinner className="w-8 h-8" />
    <p className="text-small text-content-muted">{label}</p>
  </div>
)

// Content-shaped placeholder.
//
// Preferred over a spinner wherever the final layout is known: the page does
// not jump when data lands, which matters most on the zone list users open
// first.
export const Skeleton = ({ className }) => (
  <div className={cn('skeleton', className)} aria-hidden="true" />
)

export const SkeletonCard = () => (
  <div className="surface-card p-5 space-y-3">
    <div className="flex items-center justify-between">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-6 w-20 rounded-full" />
    </div>
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-2/3" />
    <Skeleton className="h-2 w-full rounded-full" />
  </div>
)

export default PageLoader
