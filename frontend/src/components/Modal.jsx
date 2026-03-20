import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function Modal({ isOpen, onClose, title, children, size = 'md', className = '' }) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    if (isOpen) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      {/* Modal */}
      <div
        className={`
          relative w-full ${sizes[size]} bg-surface-card border border-surface-border
          rounded-2xl shadow-modal animate-slide-up
          ${className}
        `}
      >
        {title && (
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-surface-border">
            <h2 className="text-base font-semibold text-text-primary font-display">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body
  )
}

export function ModalBody({ children, className = '' }) {
  return <div className={`px-6 py-4 ${className}`}>{children}</div>
}

export function ModalFooter({ children, className = '' }) {
  return <div className={`px-6 pb-5 pt-3 flex items-center justify-end gap-3 ${className}`}>{children}</div>
}
