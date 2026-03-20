import React, { forwardRef } from 'react'

const Input = forwardRef(function Input({
  label,
  error,
  hint,
  icon,
  iconRight,
  className = '',
  inputClassName = '',
  type = 'text',
  ...props
}, ref) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-text-secondary">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          type={type}
          className={`
            w-full bg-surface-panel border rounded-xl px-4 py-2.5 text-sm
            text-text-primary placeholder:text-text-muted
            outline-none transition-all duration-150
            ${error
              ? 'border-error focus:border-error focus:ring-1 focus:ring-error/30'
              : 'border-surface-border focus:border-primary focus:ring-1 focus:ring-primary/20'
            }
            ${icon ? 'pl-10' : ''}
            ${iconRight ? 'pr-10' : ''}
            ${inputClassName}
          `}
          {...props}
        />
        {iconRight && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted">
            {iconRight}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
      {hint && !error && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  )
})

export default Input

export function Textarea({ label, error, hint, className = '', ...props }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-text-secondary">
          {label}
        </label>
      )}
      <textarea
        className={`
          w-full bg-surface-panel border rounded-xl px-4 py-3 text-sm
          text-text-primary placeholder:text-text-muted
          outline-none transition-all duration-150 resize-none
          ${error
            ? 'border-error focus:border-error focus:ring-1 focus:ring-error/30'
            : 'border-surface-border focus:border-primary focus:ring-1 focus:ring-primary/20'
          }
        `}
        {...props}
      />
      {error && <p className="text-xs text-error">{error}</p>}
      {hint && !error && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  )
}

export function Toggle({ checked, onChange, label, disabled = false }) {
  return (
    <label className={`flex items-center gap-3 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <div
        onClick={() => !disabled && onChange(!checked)}
        className={`
          relative w-10 h-6 rounded-full transition-colors duration-200 cursor-pointer
          ${checked ? 'bg-primary' : 'bg-surface-border'}
        `}
      >
        <div
          className={`
            absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200
            ${checked ? 'translate-x-5' : 'translate-x-1'}
          `}
        />
      </div>
      {label && <span className="text-sm text-text-secondary">{label}</span>}
    </label>
  )
}
