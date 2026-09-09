import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Columns3, List, MessagesSquare, Plus, Search, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/misc'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/shared/states'
import { leadsRepository } from '@/services/repositories/leads.repository'
import { LEAD_STAGE_LABELS } from '@/domain/vocabulary'
import { LEAD_STAGES, type Lead, type LeadStage } from '@/domain/types'
import { useBusiness } from '@/features/businesses/business-context'
import { TemperatureDot } from '@/features/dashboard/dashboard-page'
import { PotentialBadge } from './potential-badge'
import { formatRelative } from '@/lib/utils'

type View = 'lista' | 'kanban'

export function LeadsPage() {
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''

  const [view, setView] = useState<View>('lista')
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState<LeadStage | 'todos'>('todos')
  const [creating, setCreating] = useState(false)

  const query = useQuery({
    queryKey: ['leads', businessId, stage, search],
    queryFn: () => leadsRepository.list(businessId, { stage, search }),
    enabled: Boolean(businessId),
  })

  const leads = query.data ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Todos tus contactos y en qué punto está cada uno."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/clientes/simulador">
                <MessagesSquare />
                Simular conversación
              </Link>
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus />
              Añadir contacto
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre, email o teléfono"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select value={stage} onValueChange={(value) => setStage(value as LeadStage | 'todos')}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            {LEAD_STAGES.map((key) => (
              <SelectItem key={key} value={key}>
                {LEAD_STAGE_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <TabsList>
            <TabsTrigger value="lista">
              <List />
              Lista
            </TabsTrigger>
            <TabsTrigger value="kanban">
              <Columns3 />
              Pipeline
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {query.isLoading ? (
        <ListSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : leads.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search || stage !== 'todos' ? 'Sin resultados' : 'Todavía no tienes contactos'}
          description={
            search || stage !== 'todos'
              ? 'Prueba a cambiar la búsqueda o el filtro.'
              : 'Aparecerán aquí automáticamente cuando alguien te escriba, o puedes añadirlos a mano.'
          }
          action={
            search || stage !== 'todos'
              ? undefined
              : { label: 'Añadir contacto', onClick: () => setCreating(true) }
          }
        />
      ) : view === 'lista' ? (
        <LeadsList leads={leads} />
      ) : (
        <LeadsKanban leads={leads} businessId={businessId} />
      )}

      <CreateLeadDialog
        open={creating}
        onOpenChange={setCreating}
        businessId={businessId}
      />
    </div>
  )
}

function LeadsList({ leads }: { leads: Lead[] }) {
  return (
    <Card className="divide-y">
      {leads.map((lead) => (
        <Link
          key={lead.id}
          to={`/app/clientes/${lead.id}`}
          className="flex items-center gap-4 p-4 transition-colors hover:bg-secondary/60"
        >
          <TemperatureDot temperature={lead.temperature} />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{lead.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {lead.email ?? lead.phone ?? 'Sin datos de contacto'}
            </p>
          </div>

          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-xs text-muted-foreground">
              {lead.next_action ?? 'Sin próxima acción'}
            </p>
          </div>

          {lead.potential_label && (
            <PotentialBadge label={lead.potential_label} score={lead.potential_score} />
          )}

          <span className="hidden shrink-0 text-xs text-muted-foreground md:block">
            {formatRelative(lead.last_contacted_at ?? lead.created_at)}
          </span>

          <Badge variant="secondary" className="shrink-0">
            {LEAD_STAGE_LABELS[lead.stage]}
          </Badge>
        </Link>
      ))}
    </Card>
  )
}

function LeadsKanban({ leads, businessId }: { leads: Lead[]; businessId: string }) {
  const queryClient = useQueryClient()
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const move = useMutation({
    mutationFn: ({ leadId, stage }: { leadId: string; stage: LeadStage }) =>
      leadsRepository.moveToStage(leadId, stage),
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: ['leads', businessId] })
      toast.success(`${lead.full_name} → ${LEAD_STAGE_LABELS[lead.stage]}`)
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No hemos podido mover el contacto.'),
  })

  return (
    <div className="-mx-1 overflow-x-auto pb-2">
      <div className="flex min-w-max gap-3 px-1">
        {LEAD_STAGES.map((stage) => {
          const stageLeads = leads.filter((lead) => lead.stage === stage)

          return (
            <div
              key={stage}
              className="w-[264px] shrink-0 rounded-lg bg-secondary/50 p-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (draggingId) move.mutate({ leadId: draggingId, stage })
                setDraggingId(null)
              }}
            >
              <div className="flex items-center justify-between px-2 py-1.5">
                <p className="text-xs font-semibold">{LEAD_STAGE_LABELS[stage]}</p>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {stageLeads.length}
                </span>
              </div>

              <div className="mt-1 space-y-2">
                {stageLeads.map((lead) => (
                  <Link
                    key={lead.id}
                    to={`/app/clientes/${lead.id}`}
                    draggable
                    onDragStart={() => setDraggingId(lead.id)}
                    onDragEnd={() => setDraggingId(null)}
                    className="block cursor-grab rounded-md border bg-card p-3 shadow-sm transition-shadow hover:shadow active:cursor-grabbing"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-medium">{lead.full_name}</p>
                      <TemperatureDot temperature={lead.temperature} />
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {lead.email ?? lead.phone ?? 'Sin contacto'}
                    </p>
                    {lead.potential_label && (
                      <div className="mt-2">
                        <PotentialBadge
                          label={lead.potential_label}
                          score={lead.potential_score}
                        />
                      </div>
                    )}
                    {lead.next_action && (
                      <p className="mt-2 truncate text-[11px] text-primary">{lead.next_action}</p>
                    )}
                  </Link>
                ))}

                {stageLeads.length === 0 && (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                    Arrastra aquí
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CreateLeadDialog({
  open,
  onOpenChange,
  businessId,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  businessId: string
}) {
  const queryClient = useQueryClient()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () =>
      leadsRepository.create({
        business_id: businessId,
        full_name: fullName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        source: 'manual',
        stage: 'nuevo',
        temperature: 'templado',
        notes: null,
        value_estimate: null,
        last_contacted_at: null,
        next_action: null,
        next_action_at: null,
        assigned_agent_id: null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', businessId] })
      toast.success('Contacto añadido')
      setFullName('')
      setEmail('')
      setPhone('')
      onOpenChange(false)
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'No hemos podido crear el contacto.'),
  })

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (fullName.trim().length < 2) {
      setError('Escribe el nombre del contacto.')
      return
    }
    setError(null)
    create.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Añadir contacto</DialogTitle>
          <DialogDescription>
            Con el nombre basta. Puedes completar el resto más adelante.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="leadName">Nombre</Label>
            <Input
              id="leadName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="leadEmail">Email</Label>
            <Input
              id="leadEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="leadPhone">Teléfono</Label>
            <Input id="leadPhone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={create.isPending}>
              Añadir
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
