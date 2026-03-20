import { create } from 'zustand'

const MAX_LOGS = 50

export const useDebugStore = create((set, get) => ({
  enabled: localStorage.getItem('fs_debug') === 'true',
  logs: [],
  isOpen: false,
  filter: 'all', // 'all' | 'error' | 'stream'

  toggle: () => {
    const next = !get().enabled
    localStorage.setItem('fs_debug', String(next))
    set({ enabled: next })
  },

  openPanel: () => set({ isOpen: true }),
  closePanel: () => set({ isOpen: false }),
  setFilter: (filter) => set({ filter }),

  addLog: (entry) => {
    if (!get().enabled) return
    const logs = [
      {
        id: Date.now() + Math.random(),
        timestamp: new Date().toISOString(),
        ...entry,
      },
      ...get().logs,
    ].slice(0, MAX_LOGS)
    set({ logs })
  },

  clearLogs: () => set({ logs: [] }),
}))
