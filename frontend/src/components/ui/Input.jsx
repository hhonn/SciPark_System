import { forwardRef, useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '../../utils/cn'

/**
 * Labelled input. The label is always rendered — placeholder-only fields lose
 * their label the moment the user starts typing, which is exactly when they
 * need it.
 */
const Input = forwardRef(function Input(
  { label, hint, error, icon: Icon, className, id, type = 'text', ...props },
  ref
) {
  const generatedId = useId()
  const inputId = id || generatedId
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined

  const [revealed, setRevealed] = useState(false)
  const isPassword = type === 'password'
  const resolvedType = isPassword && revealed ? 'text' : type

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block mb-1.5 text-small font-medium text-content">
          {label}
        </label>
      )}

      <div className="relative">
        {Icon && (
          <Icon
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-content-subtle pointer-events-none"
            aria-hidden="true"
          />
        )}

        <input
          ref={ref}
          id={inputId}
          type={resolvedType}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'w-full h-11 rounded-md bg-surface text-content placeholder:text-content-subtle',
            'border-2 transition-[border-color,box-shadow] duration-fast ease-out',
            'focus:outline-none focus:ring-0',
            error
              ? 'border-risk focus:border-risk'
              : 'border-hairline focus:border-brand-500 focus:shadow-ring',
            Icon ? 'pl-11' : 'pl-3.5',
            isPassword ? 'pr-11' : 'pr-3.5',
            className
          )}
          {...props}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-2.5 text-content-subtle hover:text-content rounded-sm"
          >
            {revealed ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
          </button>
        )}
      </div>

      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-small text-risk">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-small text-content-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  )
})

export default Input
