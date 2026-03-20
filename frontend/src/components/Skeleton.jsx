import React from 'react'

export function Skeleton({ className = '', rounded = 'rounded-lg' }) {
  return <div className={`skeleton ${rounded} ${className}`} />
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="bg-surface-card border border-surface-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="w-8 h-8" rounded="rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3.5 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  )
}

export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3.5 ${i === lines - 1 ? 'w-3/4' : 'w-full'}`} />
      ))}
    </div>
  )
}

export default Skeleton
