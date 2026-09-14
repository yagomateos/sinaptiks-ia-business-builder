import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/features/auth/auth-context'
import { BusinessProvider } from '@/features/businesses/business-context'
import { ThemeProvider, useTheme } from '@/hooks/use-theme'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { SetupRequiredPage } from '@/features/misc/setup-required-page'
import { initErrorMonitoring, Sentry } from '@/services/monitoring/sentry'
import { ErrorState } from '@/components/shared/states'
import { router } from '@/app/router'
import './index.css'

initErrorMonitoring()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

function ThemedToaster() {
  const { theme } = useTheme()
  return <Toaster position="top-right" richColors closeButton theme={theme} />
}

const root = createRoot(document.getElementById('root')!)

function CrashFallback({ error }: { error: unknown }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <ErrorState
        title="La aplicación se ha detenido"
        error={error}
        onRetry={() => window.location.reload()}
        className="max-w-sm"
      />
    </div>
  )
}

root.render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={({ error }) => <CrashFallback error={error} />}>
      <ThemeProvider>
        {isSupabaseConfigured ? (
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <BusinessProvider>
                <RouterProvider router={router} />
                <ThemedToaster />
              </BusinessProvider>
            </AuthProvider>
          </QueryClientProvider>
        ) : (
          <SetupRequiredPage />
        )}
      </ThemeProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
