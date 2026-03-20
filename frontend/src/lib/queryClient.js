import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: (failureCount, error) => {
        if (error?.response?.status < 500) return false
        return failureCount < 2
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
      refetchOnWindowFocus: true,
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: 0,
      networkMode: 'offlineFirst',
    },
  },
})
