import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { queryClient } from './services/queryClient'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#111827',
            color: '#F8FAFC',
            border: '1px solid #1E293B',
            borderRadius: '10px',
            fontSize: '14px',
            fontFamily: 'DM Sans, sans-serif',
            boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          },
          success: {
            iconTheme: { primary: '#10B981', secondary: '#111827' },
            duration: 3000,
          },
          error: {
            iconTheme: { primary: '#F43F5E', secondary: '#111827' },
            duration: 4000,
          },
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>
)
