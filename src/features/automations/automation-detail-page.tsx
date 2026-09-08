import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ChevronRight, Pause, Play, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/misc'
import { PageHeader } from '@/components/shared/page-header'
import { ErrorState, LoadingState } from '@/components/shared/states'
import { automationsRepository } from '@/services/repositories/automations.repository'
import { automationService } from '@/services/system/automation.service'
import { isN8nLive } from '@/services/n8n'
import { AUTOMATION_CATEGORY_LABELS } from '@/domain/vocabulary'
import { useBusiness } from '@/features/businesses/business-context'
import { formatDateTime, formatRelative } from '@/lib/utils'
import { AutomationStatusBadge } from './automation-status-badge'

export function AutomationDetailPage() {
  const { automationId = '' } = useParams()
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['automation', automationId],
    queryFn: () => automationsRepository.getById(automationId),
    enabled: Boolean(automationId),
  })

  const executionsQuery = useQuery({
    queryKey: ['automation-executions', automationId],
    queryFn: () => automationService.listExecutions(businessId, automationId),
    enabled: Boolean(businessId && automationId),
  })

  const automation = query.data

  const toggle = useMutation({
    mutationFn: async () => {
      if (!automation) throw new Error('Automatización no encontrada')
      return automation.status === 'activa'
        ? automationService.pause(automation)
        : automationService.activate(automation)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation', automationId] })
      queryClient.invalidateQueries({ queryKey: ['automations', businessId] })
      toast.success('Estado actualizado')
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No hemos podido cambiar el estado.'),
  })

  const runOnce = useMutation({
    mutationFn: async () => {
      if (!automation) throw new Error('Automatización no encontrada')
      return automationService.runOnce(automation)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation', automationId] })
      queryClient.invalidateQueries({ queryKey: ['automation-executions', automationId] })
      toast.success('Prueba lanzada')
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No hemos podido probarla.'),
  })

  if (query.isLoading) return <LoadingState />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (!automation) return null

  const isActive = automation.status === 'activa'
  const executions = executionsQuery.data ?? []

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/app/automatizaciones">
          <ArrowLeft />
          Automatizaciones
        </Link>
      </Button>

      <PageHeader
        title={automation.name}
        description={automation.description ?? undefined}
        actions={
          <>
            {isActive && (
              <Button
                variant="outline"
                size="sm"
                loading={runOnce.isPending}
                onClick={() => runOnce.mutate()}
              >
                <Zap />
                Probar ahora
              </Button>
            )}
            <Button
              size="sm"
              variant={isActive ? 'outline' : 'default'}
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
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <AutomationStatusBadge status={automation.status} />
        <Badge variant="secondary">{AUTOMATION_CATEGORY_LABELS[automation.category]}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Cómo funciona</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border bg-secondary/40 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Cuándo se activa
              </p>
              <p className="mt-1 text-sm">{automation.trigger.description}</p>
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Qué hace
              </p>
              {automation.actions.map((action, index) => (
                <div key={index} className="flex items-center gap-3 rounded-lg border p-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  <p className="text-sm">{action.description}</p>
                  {index < automation.actions.length - 1 && (
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Resumen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Ejecuciones" value={String(automation.execution_count)} />
            <Separator />
            <Row
              label="Errores"
              value={String(automation.error_count)}
              tone={automation.error_count > 0 ? 'destructive' : undefined}
            />
            <Separator />
            <Row label="Última ejecución" value={formatRelative(automation.last_execution_at)} />
            <Separator />
            <Row label="Creada" value={formatRelative(automation.created_at)} />

            {!isN8nLive && (
              <p className="rounded-md bg-secondary/60 p-3 text-xs text-muted-foreground">
                El motor de automatización todavía no está conectado. Las ejecuciones que veas son
                de prueba.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Historial</CardTitle>
        </CardHeader>
        <CardContent>
          {executions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Todavía no se ha ejecutado ninguna vez.
            </p>
          ) : (
            <div className="divide-y">
              {executions.map((execution) => (
                <div key={execution.id} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm">{formatDateTime(execution.started_at)}</p>
                    {execution.error_message && (
                      <p className="truncate text-xs text-destructive">{execution.error_message}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {execution.duration_ms !== null && (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {execution.duration_ms} ms
                      </span>
                    )}
                    <Badge variant={execution.status === 'exito' ? 'success' : 'destructive'}>
                      {execution.status === 'exito' ? 'Correcta' : 'Error'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Row({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'destructive'
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${tone === 'destructive' ? 'text-destructive' : ''}`}>
        {value}
      </span>
    </div>
  )
}
