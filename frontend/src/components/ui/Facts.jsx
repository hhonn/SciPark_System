import { cn } from '../../utils/cn'

// A few short facts on one line ("จอด 3  รอเช็คอิน 1  ปิด 2"), spaced apart
// and wrapping cleanly on a phone. Falsy items are skipped.
const Facts = ({ items, className }) => (
  <span className={cn('inline-flex flex-wrap gap-x-3 gap-y-0.5', className)}>
    {items.filter(Boolean).map((item, i) => (
      <span key={i}>{item}</span>
    ))}
  </span>
)

export default Facts
