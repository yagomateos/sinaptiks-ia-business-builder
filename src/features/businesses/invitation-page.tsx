/**
 * Página de invitación (`/invitacion/:code`) — deliberadamente pública, sin
 * `RequireAuth` ni `RedirectIfAuthenticated`: quien llega puede estar sin
 * sesión (tiene que poder ver a qué la están invitando antes de crear una
 * cuenta), con sesión de otra cuenta (hay que decírselo, no aceptar en su
 * nombre) o con la sesión correcta (aceptar de verdad).
 */
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AuthLayout } from '@/features/auth/auth-layout'
import { useAuth } from '@/features/auth/auth-context'
import { useBusiness } from './business-context'
import { teamInvitesRepository } from '@/services/repositories/team-invites.repository'
import { MEMBER_ROLE_LABELS } from '@/domain/vocabulary'

const STATUS_MESSAGES: Record<string, string> = {
  aceptada: 'Esta invitación ya se aceptó.',
  revocada: 'Esta invitación fue revocada.',
  caducada: 'Esta invitación ha caducado. Pide que te inviten de nuevo.',
}

export function InvitationPage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const { session, loading: authLoading } = useAuth()
  const { refresh, setActiveBusinessId } = useBusiness()

  const previewQuery = useQuery({
    queryKey: ['invite-preview', code],
    queryFn: () => teamInvitesRepository.preview(code),
    enabled: Boolean(code),
    retry: false,
  })

  const accept = useMutation({
    mutationFn: () => teamInvitesRepository.accept(code),
    onSuccess: async ({ businessId }) => {
      await refresh()
      setActiveBusinessId(businessId)
      toast.success('Te has unido al negocio')
      navigate('/app', { replace: true })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No hemos podido aceptar la invitación.'),
  })

  if (authLoading || previewQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (previewQuery.isError || !previewQuery.data) {
    return (
      <AuthLayout title="Invitación no encontrada" subtitle="Puede que el enlace esté mal copiado.">
        <Button asChild className="w-full">
          <Link to="/entrar">Ir a entrar</Link>
        </Button>
      </AuthLayout>
    )
  }

  const invite = previewQuery.data

  if (invite.status !== 'pendiente') {
    return (
      <AuthLayout title="Esta invitación no está disponible" subtitle={STATUS_MESSAGES[invite.status]}>
        <Button asChild className="w-full">
          <Link to="/entrar">Ir a entrar</Link>
        </Button>
      </AuthLayout>
    )
  }

  const returnTo = `/invitacion/${code}`

  return (
    <AuthLayout
      title="Te han invitado"
      subtitle={`${invite.inviterName} te invita a unirte a ${invite.businessName} como ${MEMBER_ROLE_LABELS[invite.role]}.`}
    >
      {!session ? (
        <div className="space-y-3">
          <Button asChild className="w-full">
            <Link to={`/registro?returnTo=${encodeURIComponent(returnTo)}&email=${encodeURIComponent(invite.email)}`}>
              Crear cuenta y aceptar
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link to={`/entrar?returnTo=${encodeURIComponent(returnTo)}`}>Ya tengo cuenta — entrar</Link>
          </Button>
        </div>
      ) : session.user.email?.toLowerCase() !== invite.email.toLowerCase() ? (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">
            Esta invitación es para <strong>{invite.email}</strong>, pero has entrado como{' '}
            <strong>{session.user.email}</strong>. Cierra sesión y entra con esa cuenta para aceptarla.
          </p>
        </Card>
      ) : (
        <Button className="w-full" loading={accept.isPending} onClick={() => accept.mutate()}>
          Aceptar invitación
        </Button>
      )}
    </AuthLayout>
  )
}
