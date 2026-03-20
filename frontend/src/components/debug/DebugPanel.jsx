import React, { useState, useEffect, useRef } from 'react'
import { useDebugStore } from '../../stores/debugStore'

// ── Wire up the window bridge that api.js calls ───────────────────────
// This runs once when DebugPanel mounts and registers window.__debugLog
function useDebugBridge() {
  const addLog = useDebugStore(s => s.addLog)
  useEffect(() => {
    window.__debugLog = addLog
    return () => { delete window.__debugLog }
  }, [addLog])
}

// ── Color coding ──────────────────────────────────────────────────────
const typeStyle = {
  request: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  response: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  error: 'text-red-400 bg-red-400/10 border-red-400/20',
  stream: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
}

const statusColor = (status) => {
  if (!status) return 'text-gray-500'
  if (status < 300) return 'text-emerald-400'
  if (status < 400) return 'text-yellow-400'
  return 'text-red-400'
}

function LogEntry({ log }) {
  const [expanded, setExpanded] = useState(false)
  const hasData = log.data !== undefined || log.body !== undefined || log.message

  const label = log.type === 'request'
    ? `→ ${log.method} ${log.url}`
    : log.type === 'error'
    ? `✗ ${log.method} ${log.url}`
    : `← ${log.method} ${log.url}`

  return (
    <div className="border-b border-white/5 last:border-0">
      <button
        onClick={() => hasData && setExpanded(e => !e)}
        className={`w-full flex items-start gap-2 px-3 py-2 text-left text-xs hover:bg-white/5 transition-colors ${!hasData ? 'cursor-default' : 'cursor-pointer'}`}
      >
        {/* Type badge */}
        <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border uppercase ${typeStyle[log.type] || typeStyle.request}`}>
          {log.type}
        </span>

        {/* URL */}
        <span className="flex-1 font-mono text-gray-300 truncate leading-5">{label}</span>

        {/* Status + duration */}
        <div className="shrink-0 flex items-center gap-2">
          {log.status && (
            <span className={`font-mono font-bold ${statusColor(log.status)}`}>
              {log.status}
            </span>
          )}
          {log.duration && (
            <span className="text-gray-600">{log.duration}</span>
          )}
          {hasData && (
            <span className="text-gray-600">{expanded ? '▲' : '▼'}</span>
          )}
        </div>
      </button>

      {/* Time */}
      <div className="px-3 pb-1 text-[10px] text-gray-600 font-mono -mt-1">
        {new Date(log.timestamp).toLocaleTimeString()}
        {log.params && (
          <span className="ml-2 text-gray-700">
            ?{Object.entries(log.params).map(([k, v]) => `${k}=${v}`).join('&')}
          </span>
        )}
      </div>

      {/* Expanded data */}
      {expanded && hasData && (
        <div className="mx-3 mb-2 rounded-lg bg-black/50 border border-white/5 overflow-auto max-h-40">
          {log.message && (
            <div className="px-3 py-2 text-xs text-red-400 font-mono border-b border-white/5">
              {log.message}
            </div>
          )}
          {(log.body || log.data) && (
            <pre className="px-3 py-2 text-[11px] text-gray-300 font-mono leading-relaxed whitespace-pre-wrap break-all">
              {JSON.stringify(log.body || log.data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main floating panel ───────────────────────────────────────────────
export default function DebugPanel() {
  useDebugBridge()

  const { enabled, isOpen, logs, filter, openPanel, closePanel, setFilter, clearLogs } = useDebugStore()
  const listRef = useRef(null)

  // Don't render anything if debug mode is off
  if (!enabled) return null

  const filtered = filter === 'all'
    ? logs
    : logs.filter(l => l.type === filter)

  const errorCount = logs.filter(l => l.type === 'error').length

  return (
    <>
      {/* Floating trigger button */}
      {!isOpen && (
        <button
          onClick={openPanel}
          className="fixed bottom-20 right-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-900/95 border border-white/10 shadow-xl text-xs font-mono text-gray-300 hover:border-white/25 hover:bg-gray-800/95 transition-all backdrop-blur-sm"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          DEBUG
          {errorCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
              {errorCount}
            </span>
          )}
          <span className="text-gray-600">({logs.length})</span>
        </button>
      )}

      {/* Panel */}
      {isOpen && (
        <div className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] sm:w-[520px] max-h-[min(480px,calc(100vh-6rem))] rounded-2xl bg-[#0d1117] border border-white/10 shadow-2xl flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold font-mono text-gray-200 flex-1">
              DEBUG PANEL
            </span>
            <span className="text-xs text-gray-600 font-mono">{logs.length} logs</span>

            {/* Filters */}
            <div className="flex gap-1">
              {['all', 'request', 'response', 'error'].map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors ${
                    filter === f
                      ? 'bg-white/10 text-white'
                      : 'text-gray-600 hover:text-gray-400'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <button
              onClick={clearLogs}
              className="text-[10px] text-gray-600 hover:text-gray-400 uppercase font-bold"
            >
              Clear
            </button>
            <button
              onClick={closePanel}
              className="text-gray-500 hover:text-gray-300 text-lg leading-none ml-1"
            >
              ×
            </button>
          </div>

          {/* Log list */}
          <div ref={listRef} className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <span className="text-2xl mb-2">🔍</span>
                <p className="text-xs text-gray-600 font-mono">No logs yet</p>
                <p className="text-[10px] text-gray-700 mt-1">Make an API call to see it here</p>
              </div>
            ) : (
              filtered.map(log => <LogEntry key={log.id} log={log} />)
            )}
          </div>

          {/* Footer — quick copy */}
          <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between shrink-0">
            <span className="text-[10px] text-gray-700 font-mono">
              Tap any entry to expand payload · Errors highlighted in red
            </span>
            <button
              onClick={() => {
                const text = JSON.stringify(logs, null, 2)
                navigator.clipboard.writeText(text).then(() => {
                  // flash feedback
                  const btn = document.getElementById('debug-copy-btn')
                  if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy all' }, 1500) }
                })
              }}
              id="debug-copy-btn"
              className="text-[10px] text-gray-500 hover:text-gray-300 font-mono"
            >
              Copy all
            </button>
          </div>
        </div>
      )}
    </>
  )
}
