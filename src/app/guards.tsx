import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'
import { useBusiness } from '@/features/businesses/business-context'

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  )
}

function FullScreenError({ onRetry }: { onRetry(): void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm text-muted-foreground">No hemos podido cargar tu perfil.</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  )
}

/** Requires a signed-in user. */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullScreenLoader />
  if (!session) return <Navigate to="/entrar" state={{ from: location.pathname }} replace />

  return children ? <>{children}</> : <Outlet />
}

/** Redirects an authenticated user away from the auth screens. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) return <FullScreenLoader />
  if (session) return <Navigate to="/app" replace />

  return <>{children}</>
}

/**
 * Requires a business that has finished onboarding.
 * Sends the user to whichever step they still owe us.
 */
export function RequireOnboardedBusiness() {
  const { businesses, activeBusiness, loading } = useBusiness()

  if (loading) return <FullScreenLoader />
  if (businesses.length === 0) return <Navigate to="/nuevo-negocio" replace />
  if (!activeBusiness) return <FullScreenLoader />

  if (!activeBusiness.onboarding_completed) {
    return <Navigate to={`/onboarding/${activeBusiness.id}`} replace />
  }

  if (!activeBusiness.system_generated_at) {
    return <Navigate to={`/generando/${activeBusiness.id}`} replace />
  }

  return <Outlet />
}

/** Sinaptkis staff only. */
export function RequireSuperAdmin() {
  const { profile, profileError, loading, refreshProfile } = useAuth()

  if (loading) return <FullScreenLoader />
  if (!profile) {
    if (profileError) return <FullScreenError onRetry={() => void refreshProfile()} />
    return <FullScreenLoader />
  }
  if (profile.platform_role !== 'super_admin') return <Navigate to="/app" replace />

  return <Outlet />
}
