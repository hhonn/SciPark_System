import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '../../utils/cn'
import Button from './Button'

// Dialog rendered in a portal.
//
// Handles the three things the old modal did not: Escape closes it, focus is
// trapped inside it, and the page behind it stops scrolling.
const Modal = ({ open, onClose, title, description, children, footer, size = 'md', className }) => {
  const panelRef = useRef(null)
  const reduce = useReducedMotion()

  // Callers pass an inline arrow for onClose, so its identity changes on every
  // render. Holding it in a ref keeps the Escape handler current while letting
  // the effect below depend on `open` alone. When it depended on onClose too,
  // every keystroke in a modal form re-ran the effect and its autofocus timer
  // yanked the caret back to the first field after one character.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCloseRef.current?.()
        return
      }

      if (event.key !== 'Tab' || !panelRef.current) return

      // Keep focus inside the dialog: without this, tabbing walks into the
      // page behind the backdrop where nothing is visibly focused.
      const focusables = panelRef.current.querySelectorAll(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      )
      if (focusables.length === 0) return

      const first = focusables[0]
      const last = focusables[focusables.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    const previouslyFocused = document.activeElement
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)

    // Move focus in on open so screen readers announce the dialog.
    //
    // This used to read `...?.focus?.() ?? panelRef.current?.focus?.()`, but
    // `focus()` returns undefined, so the right-hand side ran every time and
    // immediately pulled focus off the [data-autofocus] element onto the panel.
    // The attribute therefore never did anything on any dialog that used it.
    const timer = window.setTimeout(() => {
      const target = panelRef.current?.querySelector('[data-autofocus]')
      if (target) target.focus()
      else panelRef.current?.focus()
    }, 30)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      window.clearTimeout(timer)
      previouslyFocused?.focus?.()
    }
  }, [open])

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-xl',
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="absolute inset-0 bg-ink-950/50 backdrop-blur-[6px]"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : undefined}
            tabIndex={-1}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className={cn(
              'relative w-full bg-surface border border-hairline shadow-e3 outline-none',
              'rounded-t-xl sm:rounded-xl max-h-[92vh] overflow-y-auto',
              sizes[size],
              className
            )}
          >
            {/* Grab handle for the mobile sheet presentation. */}
            <div className="sm:hidden flex justify-center pt-3" aria-hidden="true">
              <span className="w-10 h-1 rounded-full bg-hairline" />
            </div>

            {(title || onClose) && (
              <div className="flex items-start justify-between gap-4 px-5 pt-4 sm:pt-5">
                <div>
                  {title && <h2 className="text-h2 text-content">{title}</h2>}
                  {description && <p className="mt-1 text-small text-content-muted">{description}</p>}
                </div>
                {onClose && (
                  <Button variant="ghost" size="icon" onClick={onClose} aria-label="ปิด" className="-mr-2 -mt-1">
                    <X className="w-5 h-5" />
                  </Button>
                )}
              </div>
            )}

            <div className="px-5 py-4">{children}</div>

            {footer && (
              <div className="px-5 py-4 border-t border-hairline bg-surface-2 sm:rounded-b-xl pb-safe sm:pb-4">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}

export default Modal
