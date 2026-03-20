import { create } from 'zustand'

export const useRealtimeStore = create((set, get) => ({
  isConnected: false,
  activeChannels: [],
  pendingSentConfirmations: [],  // Opportunities waiting for "did you send?" confirmation

  setConnected: (status) => set({ isConnected: status }),

  addChannel: (channelName) => set((state) => ({
    activeChannels: [...new Set([...state.activeChannels, channelName])]
  })),

  removeChannel: (channelName) => set((state) => ({
    activeChannels: state.activeChannels.filter(c => c !== channelName)
  })),

  addPendingConfirmation: (opp) => set((state) => {
    const exists = state.pendingSentConfirmations.some(p => p.opportunity_id === opp.opportunity_id)
    if (exists) return state
    return { pendingSentConfirmations: [...state.pendingSentConfirmations, opp] }
  }),

  dismissConfirmation: (opportunityId) => set((state) => ({
    pendingSentConfirmations: state.pendingSentConfirmations.filter(p => p.opportunity_id !== opportunityId)
  })),

  clearConfirmations: () => set({ pendingSentConfirmations: [] }),
}))
