import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Pause, Play, Workflow } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/misc'
import { PageHeader } from '@/components/shared/page-header'
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/shared/states'
import { automationsRepository } from '@/services/repositories/automations.repository'
import { automationService } from '@/services/system/automation.service'
import {
  AUTOMATION_CATEGORY_LABELS,
  isAutomationTriggerConnected,
  UNCONNECTED_AUTOMATION_ACTIONS,
} from '@/domain/vocabulary'
import type { Automation, AutomationStatus } from '@/domain/types'
import { useBusiness } from '@/features/businesses/business-context'
import { formatRelative } from '@/lib/utils'
import { AutomationStatusBadge } from './automation-status-badge'

type Filter = AutomationStatus | 'todas'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'activa', label: 'Activas' },
  { value: 'preparada', label: 'Preparadas' },
  { value: 'pausada', label: 'Pausadas' },
  { value: 'error', label: 'Con errores' },
]

export function AutomationsPage() {
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const [filter, setFilter] = useState<Filter>('todas')

  const query = useQuery({
    queryKey: ['automations', businessId],
    queryFn: () => automationsRepository.list(businessId),
    enabled: Boolean(businessId),
  })

  const automations = query.data ?? []
  const visible = filter === 'todas' ? automations : automations.filter((a) => a.status === filter)
  const activeCount = automations.filter((a) => a.status === 'activa').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automatizaciones"
        description="Tareas que tu negocio hace solo, sin que tengas que estar pendiente."
      />

      {query.isLoading ? (
        <CardGridSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : automations.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title="Todavía no hay automatizaciones"
          description="Cuando completes la configuración de tu negocio te propondremos las que mejor le encajan."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <TabsList>
                {FILTERS.map((item) => (
                  <TabsTrigger key={item.value} value={item.value}>
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <p className="text-sm text-muted-foreground">
              {activeCount} de {automations.length} activas
            </p>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={Workflow}
              title="Nada en este estado"
              description="Prueba con otro filtro para ver el resto de tus automatizaciones."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((automation) => (
                <AutomationCard key={automation.id} automation={automation} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function AutomationCard({ automation }: { automation: Automation }) {
  const queryClient = useQueryClient()

  const toggle = useMutation({
    mutationFn: async () =>
      automation.status === 'activa'
        ? automationService.pause(automation)
        : automationService.activate(automation),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['automations', automation.business_id] })
      queryClient.invalidateQueries({ queryKey: ['activity', automation.business_id] })
      toast.success(
        updated.status === 'activa'
          ? `"${automation.name}" ya está funcionando`
          : `"${automation.name}" en pausa`,
      )
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No hemos podido cambiar el estado.')
    },
  })

  const isActive = automation.status === 'activa'
  const hasUnconnectedActions = automation.actions.some((action) =>
    UNCONNECTED_AUTOMATION_ACTIONS.has(action.type),
  )

  // Se avisa aquí porque en la lista es donde alguien decide activarla sin
  // entrar al detalle.
  const warningTitle = [
    isActive && !isAutomationTriggerConnected(automation.trigger, automation.actions)
      ? 'No se dispara sola: solo corre cuando pulsas "Probar ahora".'
      : null,
    hasUnconnectedActions ? 'Algún paso todavía no sale de verdad: falta conectar su canal.' : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <Badge variant="secondary">{AUTOMATION_CATEGORY_LABELS[automation.category]}</Badge>
        <div className="flex items-center gap-1.5">
          {warningTitle && (
            <span title={warningTitle}>
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            </span>
          )}
          <AutomationStatusBadge status={automation.status} />
        </div>
      </div>

      <Link to={`/app/automatizaciones/${automation.id}`} className="mt-4 min-w-0 flex-1 group">
        <h3 className="text-sm font-semibold leading-tight group-hover:text-primary">
          {automation.name}
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {automation.description}
        </p>
      </Link>

      <dl className="mt-5 grid grid-cols-3 gap-2 border-t pt-4 text-center">
        <div>
          <dt className="text-[11px] text-muted-foreground">Ejecuciones</dt>
          <dd className="text-sm font-semibold tabular-nums">{automation.execution_count}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted-foreground">Errores</dt>
          <dd
            className={`text-sm font-semibold tabular-nums ${automation.error_count > 0 ? 'text-destructive' : ''}`}
          >
            {automation.error_count}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted-foreground">Última vez</dt>
          <dd className="truncate text-xs font-medium">
            {automation.last_execution_at ? formatRelative(automation.last_execution_at) : '—'}
          </dd>
        </div>
      </dl>

      <Button
        variant={isActive ? 'outline' : 'default'}
        size="sm"
        className="mt-4 w-full"
        loading={toggle.isPending}
        onClick={() => toggle.mutate()}
      >
        {isActive ? (
          <>
            <Pause />
            Pausar
          </>
        ) : (
          <>
            <Play />
            Activar
          </>
        )}
      </Button>
    </Card>
  )
}
