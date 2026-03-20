import React from 'react'

export default function TypingIndicator({ label = 'Clutch is thinking' }) {
  return (
    <div className="flex items-center gap-2">
      <div className="bg-surface-card border border-surface-border rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-text-muted typing-dot" />
          <span className="w-1.5 h-1.5 rounded-full bg-text-muted typing-dot" />
          <span className="w-1.5 h-1.5 rounded-full bg-text-muted typing-dot" />
        </span>
        {label && <span className="text-xs text-text-muted ml-1">{label}</span>}
      </div>
    </div>
  )
}

export function ProspectTypingIndicator() {
  return (
    <div className="flex items-end gap-2 animate-fade-in-up">
      <div className="w-7 h-7 rounded-full bg-surface-border flex items-center justify-center text-xs shrink-0">
        👤
      </div>
      <div className="bg-surface-border rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-text-muted typing-dot" />
        <span className="w-2 h-2 rounded-full bg-text-muted typing-dot" />
        <span className="w-2 h-2 rounded-full bg-text-muted typing-dot" />
      </div>
    </div>
  )
}
