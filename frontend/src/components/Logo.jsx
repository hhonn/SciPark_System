import { cn } from '../utils/cn'

/** The parking "P" mark. Inline SVG so it inherits colour and needs no request. */
const Logo = ({ className }) => (
  <svg viewBox="0 0 64 64" className={cn('shrink-0', className)} role="img" aria-label="SciPark">
    <rect width="64" height="64" rx="16" className="fill-brand-500" />
    <path
      d="M22 46V18h12.4c6.9 0 11.1 4 11.1 10.2S41.3 38.6 34.4 38.6H29V46h-7Zm7-13.6h4.7c3 0 4.7-1.6 4.7-4.2s-1.7-4.2-4.7-4.2H29v8.4Z"
      fill="#fff"
    />
  </svg>
)

export default Logo
