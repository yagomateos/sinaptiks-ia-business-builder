import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Bot,
  CalendarCheck,
  MessageSquare,
  Users,
  Workflow,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/misc'
import { StatCard } from '@/components/shared/stat-card'
import { EmptyState, ErrorState } from '@/components/shared/states'
import { activityRepository } from '@/services/repositories/activity.repository'
import { agentsRepository } from '@/services/repositories/agents.repository'
import { automationsRepository } from '@/services/repositories/automations.repository'
import { conversationsRepository } from '@/services/repositories/conversations.repository'
import { integrationsRepository } from '@/services/repositories/integrations.repository'
import { leadsRepository } from '@/services/repositories/leads.repository'
import { LEAD_STAGE_LABELS, LEAD_TEMPERATURE_LABELS } from '@/domain/vocabulary'
import type { LeadTemperature } from '@/domain/types'
import { useAuth } from '@/features/auth/auth-context'
import { useBusiness } from '@/features/businesses/business-context'
import { firstName, formatRelative, greeting } from '@/lib/utils'
import { AutomationStatusBadge } from '@/features/automations/automation-status-badge'

export function DashboardPage() {
  const { profile } = useAuth()
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''

  const leadsQuery = useQuery({
    queryKey: ['leads', businessId],
    queryFn: () => leadsRepository.list(businessId),
    enabled: Boolean(businessId),
  })

  const conversationsQuery = useQuery({
    queryKey: ['conversations', businessId],
    queryFn: () => conversationsRepository.list(businessId),
    enabled: Boolean(businessId),
  })

  const automationsQuery = useQuery({
    queryKey: ['automations', businessId],
    queryFn: () => automationsRepository.list(businessId),
    enabled: Boolean(businessId),
  })

  const agentsQuery = useQuery({
    queryKey: ['agents', businessId],
    queryFn: () => agentsRepository.list(businessId),
    enabled: Boolean(businessId),
  })

  const activityQuery = useQuery({
    queryKey: ['activity', businessId],
    queryFn: () => activityRepository.list(businessId, 8),
    enabled: Boolean(businessId),
  })

  const integrationsQuery = useQuery({
    queryKey: ['integrations', businessId],
    queryFn: () => integrationsRepository.list(businessId),
    enabled: Boolean(businessId),
  })

  const loading =
    leadsQuery.isLoading || automationsQuery.isLoading || agentsQuery.isLoading

  if (leadsQuery.isError) {
    return <ErrorState error={leadsQuery.error} onRetry={() => leadsQuery.refetch()} />
  }

  const leads = leadsQuery.data ?? []
  const conversations = conversationsQuery.data ?? []
  const automations = automationsQuery.data ?? []
  const agents = agentsQuery.data ?? []
  const integrations = integrationsQuery.data ?? []

  const activeAutomations = automations.filter((a) => a.status === 'activa')
  const failingAutomations = automations.filter((a) => a.status === 'error')
  const openConversations = conversations.filter((c) => c.status !== 'cerrada')
  const appointments = leads.filter((l) => l.stage === 'cita')
  const activeAgents = agents.filter((a) => a.status === 'activo')
  const connectedIntegrations = integrations.filter((i) => i.status === 'conectado')

  const alerts = buildAlerts({
    failingAutomationCount: failingAutomations.length,
    readyAutomationCount: automations.filter((a) => a.status === 'preparada').length,
    draftAgentCount: agents.filter((a) => a.status === 'borrador').length,
    connectedCount: connectedIntegrations.length,
    unreadCount: conversations.reduce((total, c) => total + c.unread_count, 0),
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {greeting()}
          {profile?.full_name ? `, ${firstName(profile.full_name)}` : ''}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Este es el estado de tu sistema.</p>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[108px]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Clientes"
            value={leads.length}
            icon={Users}
            to="/app/clientes"
            hint={`${leads.filter((l) => l.stage === 'nuevo').length} sin contactar`}
          />
          <StatCard
            label="Conversaciones"
            value={openConversations.length}
            icon={MessageSquare}
            to="/app/conversaciones"
            hint={`${conversations.length} en total`}
          />
          <StatCard label="Citas" value={appointments.length} icon={CalendarCheck} to="/app/clientes" />
          <StatCard
            label="Automatizaciones"
            value={activeAutomations.length}
            icon={Workflow}
            to="/app/automatizaciones"
            hint={`de ${automations.length} preparadas`}
            tone={failingAutomations.length > 0 ? 'destructive' : 'default'}
          />
          <StatCard
            label="Agentes IA"
            value={activeAgents.length}
            icon={Bot}
            to="/app/agentes"
            hint={`de ${agents.length} configurados`}
          />
        </div>
      )}

      {alerts.length > 0 && (
        <Card className="border-warning/30 bg-warning/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Para que tu sistema funcione al 100%
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.map((alert) => (
              <div key={alert.title} className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">{alert.title}</p>
                <Button size="sm" variant="outline" asChild>
                  <Link to={alert.to}>{alert.cta}</Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm">Automatizaciones activas</CardTitle>
            <Button size="sm" variant="ghost" asChild>
              <Link to="/app/automatizaciones">Ver todas</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {activeAutomations.length === 0 ? (
              <EmptyState
                icon={Workflow}
                title="Todavía no hay ninguna activa"
                description="Tienes automatizaciones preparadas esperando a que las actives."
                className="border-0 py-10"
              />
            ) : (
              <div className="space-y-1">
                {activeAutomations.slice(0, 5).map((automation) => (
                  <Link
                    key={automation.id}
                    to={`/app/automatizaciones/${automation.id}`}
                    className="flex items-center justify-between gap-4 rounded-md px-2 py-2.5 transition-colors hover:bg-secondary"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{automation.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {automation.execution_count} ejecuciones ·{' '}
                        {formatRelative(automation.last_execution_at)}
                      </p>
                    </div>
                    <AutomationStatusBadge status={automation.status} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Actividad reciente</CardTitle>
          </CardHeader>
          <CardContent>
            {(activityQuery.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Aquí verás todo lo que va pasando.
              </p>
            ) : (
              <div className="space-y-3">
                {(activityQuery.data ?? []).map((entry) => (
                  <div key={entry.id} className="flex gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                    <div className="min-w-0">
                      <p className="text-sm leading-snug">{entry.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatRelative(entry.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm">Últimos clientes</CardTitle>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/app/clientes">Ver todos</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {leads.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Todavía no tienes contactos"
              description="En cuanto alguien te escriba por un canal conectado aparecerá aquí automáticamente."
              className="border-0 py-10"
            />
          ) : (
            <div className="space-y-1">
              {leads.slice(0, 6).map((lead) => (
                <Link
                  key={lead.id}
                  to={`/app/clientes/${lead.id}`}
                  className="flex items-center justify-between gap-4 rounded-md px-2 py-2.5 transition-colors hover:bg-secondary"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{lead.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {lead.email ?? lead.phone ?? 'Sin datos de contacto'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <TemperatureDot temperature={lead.temperature} />
                    <Badge variant="secondary">{LEAD_STAGE_LABELS[lead.stage]}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

const TEMPERATURE_COLORS: Record<LeadTemperature, string> = {
  frio: 'bg-muted-foreground/40',
  templado: 'bg-warning',
  caliente: 'bg-destructive',
}

export function TemperatureDot({ temperature }: { temperature: LeadTemperature }) {
  return (
    <span
      className={`h-2 w-2 rounded-full ${TEMPERATURE_COLORS[temperature]}`}
      title={LEAD_TEMPERATURE_LABELS[temperature]}
    />
  )
}

interface Alert {
  title: string
  cta: string
  to: string
}

function buildAlerts(input: {
  failingAutomationCount: number
  readyAutomationCount: number
  draftAgentCount: number
  connectedCount: number
  unreadCount: number
}): Alert[] {
  const alerts: Alert[] = []

  if (input.failingAutomationCount > 0) {
    alerts.push({
      title: `${input.failingAutomationCount} ${input.failingAutomationCount === 1 ? 'automatización tiene' : 'automatizaciones tienen'} errores`,
      cta: 'Revisar',
      to: '/app/automatizaciones',
    })
  }

  if (input.connectedCount === 0) {
    alerts.push({
      title: 'Conecta un canal para empezar a recibir clientes',
      cta: 'Conectar',
      to: '/app/canales',
    })
  }

  if (input.readyAutomationCount > 0) {
    alerts.push({
      title: `Tienes ${input.readyAutomationCount} ${input.readyAutomationCount === 1 ? 'automatización preparada' : 'automatizaciones preparadas'} sin activar`,
      cta: 'Activar',
      to: '/app/automatizaciones',
    })
  }

  if (input.draftAgentCount > 0) {
    alerts.push({
      title: `${input.draftAgentCount} ${input.draftAgentCount === 1 ? 'agente está' : 'agentes están'} en borrador`,
      cta: 'Revisar',
      to: '/app/agentes',
    })
  }

  if (input.unreadCount > 0) {
    alerts.push({
      title: `${input.unreadCount} ${input.unreadCount === 1 ? 'mensaje sin leer' : 'mensajes sin leer'}`,
      cta: 'Abrir',
      to: '/app/conversaciones',
    })
  }

  return alerts.slice(0, 4)
}
