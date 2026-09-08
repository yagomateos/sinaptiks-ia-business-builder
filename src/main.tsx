import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/features/auth/auth-context'
import { BusinessProvider } from '@/features/businesses/business-context'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { SetupRequiredPage } from '@/features/misc/setup-required-page'
import { router } from '@/app/router'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

const root = createRoot(document.getElementById('root')!)

root.render(
  <StrictMode>
    {isSupabaseConfigured ? (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BusinessProvider>
            <RouterProvider router={router} />
            <Toaster position="top-right" richColors closeButton />
          </BusinessProvider>
        </AuthProvider>
      </QueryClientProvider>
    ) : (
      <SetupRequiredPage />
    )}
  </StrictMode>,
)
