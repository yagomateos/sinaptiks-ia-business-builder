import { useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  MessageSquare,
  Pause,
  Play,
  RefreshCw,
  Zap,
} from 'lucide-react'
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
import {
  AUTOMATION_CATEGORY_LABELS,
  AUTOMATION_SYNC_STATUS_LABELS,
  isAutomationTriggerConnected,
  UNCONNECTED_AUTOMATION_ACTIONS,
} from '@/domain/vocabulary'
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

  // El botón de activar/pausar es el único camino que mantiene sincronizado
  // el estado guardado con el de n8n — pero el workflow puede haber cambiado
  // por otra vía (se desactivó directamente en n8n, o se activó a mano fuera
  // de la app). Se comprueba una vez por visita a la ficha, no en cada
  // render de la lista, para no multiplicar llamadas al motor.
  const syncedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!automation?.n8n_workflow_id || syncedRef.current === automation.id) return
    syncedRef.current = automation.id

    automationService.syncStatus(automation).then((synced) => {
      if (synced.status !== automation.status) {
        queryClient.setQueryData(['automation', automationId], synced)
      }
    })
  }, [automation, automationId, queryClient])

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

  const resync = useMutation({
    mutationFn: async () => {
      if (!automation) throw new Error('Automatización no encontrada')
      return automationService.resync(automation)
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['automation', automationId], updated)
      queryClient.invalidateQueries({ queryKey: ['automations', businessId] })
      if (updated.sync_status === 'error') {
        toast.error(updated.sync_error ?? 'n8n no aceptó la definición actualizada.')
      } else {
        toast.success('Sincronizado con n8n')
      }
    },
    onError: (error) => {
      // El estado real (sync_status: 'error') ya lo escribió la Edge
      // Function directamente en la base de datos — se relee para que el
      // panel lo refleje aunque la petición en sí haya fallado.
      queryClient.invalidateQueries({ queryKey: ['automation', automationId] })
      toast.error(error instanceof Error ? error.message : 'No se pudo sincronizar con n8n.')
    },
  })

  const runOnce = useMutation({
    mutationFn: async () => {
      if (!automation) throw new Error('Automatización no encontrada')
      return automationService.runOnce(automation)
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['automation', automationId] })
      // n8n procesa en segundo plano: el registro de la ejecución tarda unos
      // segundos en aparecer. Un pequeño margen antes de refrescar evita que
      // "Prueba lanzada" se quede sin nada nuevo que enseñar en el historial.
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['automation-executions', automationId] })
      }, 4000)
      toast.success('Prueba lanzada — el historial se actualizará en unos segundos')
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No hemos podido probarla.'),
  })

  if (query.isLoading) return <LoadingState />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (!automation) return null

  const isActive = automation.status === 'activa'
  const executions = executionsQuery.data ?? []
  const unconnectedActions = automation.actions.filter((action) =>
    UNCONNECTED_AUTOMATION_ACTIONS.has(action.type),
  )

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
            {automation.n8n_workflow_id && (
              <Button
                variant="outline"
                size="sm"
                loading={resync.isPending}
                onClick={() => resync.mutate()}
              >
                <RefreshCw />
                {automation.sync_status === 'error' ? 'Reintentar' : 'Sincronizar ahora'}
              </Button>
            )}
            {/* "programado" no tiene webhook en el workflow (n8n dispara su
                propio nodo de horario, ver buildTriggerNode) — el backend ya
                rechaza probarlo a mano con un error claro; mejor no ofrecer
                el botón que lo confirma con uno confuso. */}
            {isActive && automation.trigger.type !== 'programado' && (
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

      {unconnectedActions.length > 0 && (
        <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>
            {unconnectedActions.length === automation.actions.length
              ? 'Ningún paso de esta automatización sale todavía de verdad: '
              : 'Algún paso de esta automatización no sale todavía de verdad: '}
            se registra la ejecución, pero falta conectar el canal (
            {unconnectedActions.map((a) => a.description).join(', ')}
            ). No se lo prometas a tus clientes hasta que esté conectado.
          </p>
        </div>
      )}

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
              {!isAutomationTriggerConnected(automation.trigger, automation.actions) && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Este disparador no está conectado a ningún evento real todavía — la
                  automatización no se lanza sola. Solo se ejecuta cuando pulsas "Probar ahora".
                </p>
              )}
              {automation.trigger.type === 'programado' && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Se ejecuta sola según este horario — no se puede lanzar a mano, por eso no hay
                  botón de "Probar ahora" aquí.
                </p>
              )}
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Qué hace
              </p>
              {automation.actions.map((action, index) => {
                const isUnconnected = UNCONNECTED_AUTOMATION_ACTIONS.has(action.type)
                return (
                  <div key={index} className="flex items-center gap-3 rounded-lg border p-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    <p className="text-sm">{action.description}</p>
                    {isUnconnected && (
                      <Badge variant="warning" className="shrink-0 gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Canal no conectado
                      </Badge>
                    )}
                    {index < automation.actions.length - 1 && (
                      <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </div>
                )
              })}
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

            {automation.n8n_workflow_id && (
              <>
                <Separator />
                <Row
                  label="Workflow en n8n"
                  value={
                    automation.sync_status
                      ? `${AUTOMATION_SYNC_STATUS_LABELS[automation.sync_status]} (v${automation.workflow_version})`
                      : 'Sin sincronizar todavía'
                  }
                  tone={automation.sync_status === 'error' ? 'destructive' : undefined}
                />
                <Row label="Última sincronización" value={formatRelative(automation.last_synced_at)} />
                {automation.sync_status === 'error' && automation.sync_error && (
                  <p className="rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                    {automation.sync_error}
                  </p>
                )}
              </>
            )}

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
              {executions.map((execution) => {
                const conversationId = extractConversationId(execution.payload)

                return (
                  <div key={execution.id} className="flex items-center justify-between gap-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm">{formatDateTime(execution.started_at)}</p>
                      {execution.error_message && (
                        <p className="text-xs leading-relaxed text-destructive">
                          {execution.error_message}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {conversationId && (
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/app/conversaciones/${conversationId}`}>
                            <MessageSquare />
                            Ver conversación
                          </Link>
                        </Button>
                      )}
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
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** El payload de una ejecución es jsonb sin tipo: se valida antes de usarlo. */
function extractConversationId(payload: Record<string, unknown>): string | null {
  const id = payload.conversationId
  return typeof id === 'string' ? id : null
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
