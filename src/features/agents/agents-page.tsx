import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/misc'
import { PageHeader } from '@/components/shared/page-header'
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/shared/states'
import { agentsRepository } from '@/services/repositories/agents.repository'
import { CHANNEL_LABELS } from '@/domain/vocabulary'
import type { AiAgent, ContactChannel } from '@/domain/types'
import { useBusiness } from '@/features/businesses/business-context'

export function AgentsPage() {
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''

  const query = useQuery({
    queryKey: ['agents', businessId],
    queryFn: () => agentsRepository.list(businessId),
    enabled: Boolean(businessId),
  })

  const agents = query.data ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agentes IA"
        description="Quién atiende a tus clientes cuando tú no puedes. Cada uno tiene su papel."
      />

      {query.isLoading ? (
        <CardGridSkeleton count={3} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : agents.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="Todavía no tienes agentes"
          description="Se crearán automáticamente al generar el sistema de tu negocio."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  )
}

function AgentCard({ agent }: { agent: AiAgent }) {
  const queryClient = useQueryClient()

  const toggle = useMutation({
    mutationFn: (active: boolean) =>
      agentsRepository.update(agent.id, { status: active ? 'activo' : 'pausado' }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['agents', agent.business_id] })
      toast.success(
        updated.status === 'activo'
          ? `${agent.name} ya está atendiendo`
          : `${agent.name} está en pausa`,
      )
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No hemos podido cambiar el estado.'),
  })

  const isActive = agent.status === 'activo'

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <Switch
          checked={isActive}
          disabled={toggle.isPending}
          onCheckedChange={(checked) => toggle.mutate(checked)}
          aria-label={`Activar ${agent.name}`}
        />
      </div>

      <Link to={`/app/agentes/${agent.id}`} className="group mt-4 min-w-0 flex-1">
        <h3 className="text-sm font-semibold group-hover:text-primary">{agent.name}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{agent.description}</p>
      </Link>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {agent.channels.slice(0, 3).map((channel) => (
          <Badge key={channel} variant="outline" className="gap-1">
            <MessageCircle />
            {CHANNEL_LABELS[channel as ContactChannel] ?? channel}
          </Badge>
        ))}
        {agent.channels.length > 3 && (
          <Badge variant="outline">+{agent.channels.length - 3}</Badge>
        )}
      </div>

      <Button variant="outline" size="sm" className="mt-4 w-full" asChild>
        <Link to={`/app/agentes/${agent.id}`}>Configurar</Link>
      </Button>
    </Card>
  )
}
