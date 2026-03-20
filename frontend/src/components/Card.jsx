import React from 'react'

export default function Card({ children, className = '', hover = false, onClick, padding = 'md' }) {
  const paddings = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' }
  return (
    <div
      onClick={onClick}
      className={`
        bg-surface-card border border-surface-border rounded-xl shadow-card
        ${hover ? 'hover:border-surface-mid transition-colors duration-150 cursor-pointer' : ''}
        ${paddings[padding]}
        ${className}
      `}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '' }) {
  return <div className={`flex items-center justify-between mb-4 ${className}`}>{children}</div>
}

export function CardTitle({ children, className = '' }) {
  return <h3 className={`text-sm font-semibold text-text-secondary ${className}`}>{children}</h3>
}
