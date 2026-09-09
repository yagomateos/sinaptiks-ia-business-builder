import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AtSign,
  Bot,
  Calendar,
  Camera,
  CreditCard,
  Database,
  MessageCircle,
  Mic,
  Send,
  Server,
  ThumbsUp,
  Workflow,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/page-header'
import { CardGridSkeleton, ErrorState } from '@/components/shared/states'
import { integrationsRepository } from '@/services/repositories/integrations.repository'
import { isN8nLive } from '@/services/n8n'
import {
  INTEGRATION_DESCRIPTIONS,
  INTEGRATION_LABELS,
  INTEGRATION_STATUS_LABELS,
} from '@/domain/vocabulary'
import {
  INTEGRATION_PROVIDERS,
  type Integration,
  type IntegrationProvider,
  type IntegrationStatus,
} from '@/domain/types'
import { useBusiness } from '@/features/businesses/business-context'
import { formatRelative } from '@/lib/utils'

const PROVIDER_ICONS: Record<IntegrationProvider, LucideIcon> = {
  n8n: Workflow,
  whatsapp: MessageCircle,
  telegram: Send,
  google_calendar: Calendar,
  gmail: AtSign,
  instagram: Camera,
  facebook: ThumbsUp,
  stripe: CreditCard,
  openai: Bot,
  anthropic: Bot,
  ollama: Server,
  qdrant: Database,
  elevenlabs: Mic,
}

const STATUS_VARIANTS: Record<IntegrationStatus, 'outline' | 'secondary' | 'success' | 'destructive'> = {
  no_conectado: 'outline',
  conectando: 'secondary',
  conectado: 'success',
  error: 'destructive',
}

/** Providers a business owner sets up directly. The rest are platform-level. */
const CUSTOMER_FACING: IntegrationProvider[] = [
  'whatsapp',
  'gmail',
  'google_calendar',
  'instagram',
  'facebook',
  'stripe',
]

export function IntegrationsPage() {
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''

  const query = useQuery({
    queryKey: ['integrations', businessId],
    queryFn: () => integrationsRepository.list(businessId),
    enabled: Boolean(businessId),
  })

  const integrations = query.data ?? []
  const byProvider = new Map(integrations.map((i) => [i.provider, i]))

  const channels = CUSTOMER_FACING
  const platform = INTEGRATION_PROVIDERS.filter((p) => !CUSTOMER_FACING.includes(p))

  return (
    <div className="space-y-8">
      <PageHeader
        title="Canales y conexiones"
        description="Conecta las herramientas que ya usas para que tu sistema pueda trabajar con ellas."
      />

      {query.isLoading ? (
        <CardGridSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          <section>
            <h2 className="text-sm font-semibold">Canales de tus clientes</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Por aquí llegan los mensajes y por aquí responden tus agentes.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {channels.map((provider) => (
                <IntegrationCard
                  key={provider}
                  provider={provider}
                  integration={byProvider.get(provider)}
                  businessId={businessId}
                />
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold">Motor y modelos</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              La parte técnica que hace funcionar tus automatizaciones y agentes.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {platform.map((provider) => (
                <IntegrationCard
                  key={provider}
                  provider={provider}
                  integration={byProvider.get(provider)}
                  businessId={businessId}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function IntegrationCard({
  provider,
  integration,
  businessId,
}: {
  provider: IntegrationProvider
  integration: Integration | undefined
  businessId: string
}) {
  const queryClient = useQueryClient()
  const Icon = PROVIDER_ICONS[provider]

  // El motor lo configura la plataforma, no cada negocio: su estado real es si
  // hay backend detrás, no lo que diga la fila de la base de datos.
  const isEngine = provider === 'n8n'
  const status: IntegrationStatus = isEngine
    ? isN8nLive
      ? 'conectado'
      : 'no_conectado'
    : (integration?.status ?? 'no_conectado')

  const connect = useMutation({
    mutationFn: async () => {
      if (status === 'conectado' || status === 'conectando') {
        return integrationsRepository.setStatus(businessId, provider, 'no_conectado')
      }

      // The real OAuth / API-key exchange happens server-side. Until that
      // backend exists we only record the intent, so nothing is faked as live.
      return integrationsRepository.setStatus(businessId, provider, 'conectando')
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['integrations', businessId] })
      toast.success(
        updated.status === 'conectando'
          ? `Te avisaremos en cuanto ${INTEGRATION_LABELS[provider]} esté listo`
          : 'Conexión desactivada',
      )
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No hemos podido cambiar la conexión.'),
  })

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <Badge variant={STATUS_VARIANTS[status]}>{INTEGRATION_STATUS_LABELS[status]}</Badge>
      </div>

      <div className="mt-4 min-w-0 flex-1">
        <h3 className="text-sm font-semibold">{INTEGRATION_LABELS[provider]}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {INTEGRATION_DESCRIPTIONS[provider]}
        </p>
        {integration?.connected_at && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Conectado {formatRelative(integration.connected_at)}
          </p>
        )}
        {integration?.last_error && (
          <p className="mt-2 text-xs text-destructive">{integration.last_error}</p>
        )}
        {status === 'conectando' && (
          <p className="mt-2 text-xs text-muted-foreground">
            Te avisaremos en cuanto esté disponible.
          </p>
        )}
      </div>

      {isEngine ? (
        <p className="mt-4 rounded-md bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
          {isN8nLive
            ? 'Lo gestiona Sinaptkis. Tus automatizaciones ya se ejecutan de verdad.'
            : 'Lo gestiona Sinaptkis. Todavía no está activo en tu cuenta.'}
        </p>
      ) : (
        <Button
          variant={status === 'conectado' ? 'outline' : 'default'}
          size="sm"
          className="mt-4 w-full"
          loading={connect.isPending}
          onClick={() => connect.mutate()}
        >
          {status === 'conectado'
            ? 'Desconectar'
            : status === 'conectando'
              ? 'Quitar de la lista'
              : 'Conectar'}
        </Button>
      )}
    </Card>
  )
}
