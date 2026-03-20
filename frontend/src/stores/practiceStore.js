import { create } from 'zustand'

export const usePracticeStore = create((set, get) => ({
  activeSession: null,
  activeChatId: null,
  deliveryStatuses: {},     // messageId → 'sent' | 'delivered' | 'seen' | 'replied' | 'ghosted'
  isProspectTyping: false,
  buyerState: null,
lastStateDelta: null,
skillScores: null,
annotations: {},

setBuyerState: (state)   => set({ buyerState: state }),
setLastDelta:  (delta)   => set({ lastStateDelta: delta }),
setSkillScores: (scores) => set({ skillScores: scores }),
setAnnotations: (ann)    => set({ annotations: ann }),

clearSession: () => set({
  activeSession: null,
  activeChatId: null,
  deliveryStatuses: {},
  isProspectTyping: false,
  buyerState: null,
  lastStateDelta: null,
  skillScores: null,
  annotations: {},
}),

  setSession: (session) => set({ activeSession: session }),
  setChatId: (chatId) => set({ activeChatId: chatId }),

  updateDelivery: (messageId, status) => set((state) => ({
    deliveryStatuses: { ...state.deliveryStatuses, [messageId]: status }
  })),

  setProspectTyping: (typing) => set({ isProspectTyping: typing }),
}))
