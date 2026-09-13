import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Mail, Phone, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { ErrorState, LoadingState } from '@/components/shared/states'
import { leadsRepository } from '@/services/repositories/leads.repository'
import { appointmentsRepository } from '@/services/repositories/appointments.repository'
import {
  APPOINTMENT_STATUS_LABELS,
  LEAD_STAGE_LABELS,
  LEAD_TEMPERATURE_LABELS,
} from '@/domain/vocabulary'
import { LEAD_STAGES, LEAD_TEMPERATURES, type LeadStage, type LeadTemperature } from '@/domain/types'
import { useBusiness } from '@/features/businesses/business-context'
import { PotentialBadge, PotentialBar } from './potential-badge'
import { useEditableDraft } from '@/hooks/use-editable-draft'
import { cn, formatDateTime, formatRelative } from '@/lib/utils'

export function LeadDetailPage() {
  const { leadId = '' } = useParams()
  const navigate = useNavigate()
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => leadsRepository.getById(leadId),
    enabled: Boolean(leadId),
  })

  const appointmentsQuery = useQuery({
    queryKey: ['lead-appointments', leadId],
    queryFn: () => appointmentsRepository.listForLead(leadId),
    enabled: Boolean(leadId),
  })

  const [draft, update] = useEditableDraft(query.data, leadId)

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error('Nada que guardar')
      return leadsRepository.update(draft.id, {
        full_name: draft.full_name,
        email: draft.email,
        phone: draft.phone,
        stage: draft.stage,
        temperature: draft.temperature,
        notes: draft.notes,
        next_action: draft.next_action,
        value_estimate: draft.value_estimate,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] })
      queryClient.invalidateQueries({ queryKey: ['leads', businessId] })
      toast.success('Cambios guardados')
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No hemos podido guardar.'),
  })

  const remove = useMutation({
    mutationFn: () => leadsRepository.remove(leadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', businessId] })
      toast.success('Contacto eliminado')
      navigate('/app/clientes')
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No hemos podido eliminarlo.'),
  })

  if (query.isLoading) return <LoadingState />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (!draft) return null

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/app/clientes">
          <ArrowLeft />
          Clientes
        </Link>
      </Button>

      <PageHeader
        title={draft.full_name}
        description={`Añadido ${formatRelative(draft.created_at)}`}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              loading={remove.isPending}
              onClick={() => remove.mutate()}
            >
              <Trash2 />
              Eliminar
            </Button>
            <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>
              Guardar
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Datos de contacto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Nombre</Label>
              <Input
                id="fullName"
                value={draft.full_name}
                onChange={(e) => update({ full_name: e.target.value })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={draft.email ?? ''}
                  onChange={(e) => update({ email: e.target.value || null })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Teléfono</Label>
                <Input
                  id="phone"
                  value={draft.phone ?? ''}
                  onChange={(e) => update({ phone: e.target.value || null })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                rows={5}
                value={draft.notes ?? ''}
                onChange={(e) => update({ notes: e.target.value || null })}
                placeholder="Lo que necesitas recordar sobre este contacto."
              />
            </div>

            {(draft.email || draft.phone) && (
              <div className="flex gap-2">
                {draft.email && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={`mailto:${draft.email}`}>
                      <Mail />
                      Escribir
                    </a>
                  </Button>
                )}
                {draft.phone && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={`tel:${draft.phone}`}>
                      <Phone />
                      Llamar
                    </a>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Seguimiento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Select
                  value={draft.stage}
                  onValueChange={(value) => update({ stage: value as LeadStage })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_STAGES.map((key) => (
                      <SelectItem key={key} value={key}>
                        {LEAD_STAGE_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Interés</Label>
                <Select
                  value={draft.temperature}
                  onValueChange={(value) => update({ temperature: value as LeadTemperature })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_TEMPERATURES.map((key) => (
                      <SelectItem key={key} value={key}>
                        {LEAD_TEMPERATURE_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="nextAction">Próxima acción</Label>
                <Input
                  id="nextAction"
                  value={draft.next_action ?? ''}
                  onChange={(e) => update({ next_action: e.target.value || null })}
                  placeholder="Llamar el jueves"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="value">Valor estimado (€)</Label>
                <Input
                  id="value"
                  type="number"
                  min="0"
                  value={draft.value_estimate ?? ''}
                  onChange={(e) =>
                    update({ value_estimate: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </div>
            </CardContent>
          </Card>

          {(appointmentsQuery.isError || (appointmentsQuery.data?.length ?? 0) > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Citas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {appointmentsQuery.isError ? (
                  <div className="space-y-2">
                    <p className="text-xs text-destructive">No hemos podido cargar las citas.</p>
                    <Button variant="outline" size="sm" onClick={() => appointmentsQuery.refetch()}>
                      Reintentar
                    </Button>
                  </div>
                ) : (
                  appointmentsQuery.data!.map((appointment) => (
                  <div key={appointment.id} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{appointment.service}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(appointment.starts_at)}
                      </p>
                    </div>
                    <Badge
                      variant={
                        appointment.status === 'confirmada'
                          ? 'success'
                          : appointment.status === 'error'
                            ? 'destructive'
                            : appointment.status === 'cancelada'
                              ? 'outline'
                              : 'secondary'
                      }
                      className="shrink-0"
                    >
                      {APPOINTMENT_STATUS_LABELS[appointment.status]}
                    </Badge>
                  </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}

          {draft.potential_label && draft.potential_score !== null && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Potencial</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-end justify-between">
                    <span className="text-3xl font-semibold tabular-nums">
                      {draft.potential_score}
                    </span>
                    <PotentialBadge label={draft.potential_label} />
                  </div>
                  <div className="mt-2">
                    <PotentialBar score={draft.potential_score} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Valorado {formatRelative(draft.scored_at)}
                  </p>
                </div>

                <ScoreReasons signals={draft.score_signals} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Historial</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Origen</span>
                <span className="font-medium">{draft.source}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Último contacto</span>
                <span className="font-medium">{formatRelative(draft.last_contacted_at)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

/**
 * Las razones se guardaron como jsonb, así que llegan sin tipo. Se valida la
 * forma antes de pintarlas: una fila corrupta no debería romper la ficha.
 */
function ScoreReasons({ signals }: { signals: Record<string, unknown> | null }) {
  const raw = Array.isArray(signals?.reasons) ? signals.reasons : []
  const reasons = raw.filter(
    (r): r is { label: string; points: number } =>
      typeof r === 'object' &&
      r !== null &&
      typeof (r as { label?: unknown }).label === 'string' &&
      typeof (r as { points?: unknown }).points === 'number',
  )

  if (reasons.length === 0) return null

  return (
    <div className="space-y-1.5 border-t pt-3">
      <p className="text-xs font-medium text-muted-foreground">Por qué</p>
      {reasons.map((r) => (
        <div key={r.label} className="flex items-start justify-between gap-3 text-xs">
          <span className="text-muted-foreground">{r.label}</span>
          <span
            className={cn(
              'shrink-0 font-medium tabular-nums',
              r.points > 0 ? 'text-success' : 'text-destructive',
            )}
          >
            {r.points > 0 ? '+' : ''}
            {r.points}
          </span>
        </div>
      ))}
    </div>
  )
}
