import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  Check,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Mail,
  Plus,
  Trash2,
  UserPlus,
  UserRound,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
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
import { Avatar, AvatarFallback, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc'
import { PageHeader } from '@/components/shared/page-header'
import { ErrorState, LoadingState } from '@/components/shared/states'
import { businessesRepository } from '@/services/repositories/businesses.repository'
import { businessProfileRepository } from '@/services/repositories/business-profile.repository'
import { subscriptionsRepository } from '@/services/repositories/subscriptions.repository'
import { stripeService } from '@/services/billing/stripe.service'
import { businessService } from '@/services/system/business.service'
import { dataExportService } from '@/services/system/data-export.service'
import { teamInvitesRepository, type PendingInvite } from '@/services/repositories/team-invites.repository'
import { PLAN_LIMITS } from '@/domain/catalog/plan-limits'
import {
  BRAND_VOICE_LABELS,
  GOAL_LABELS,
  INDUSTRY_LABELS,
  MEMBER_ROLE_LABELS,
  PLAN_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
} from '@/domain/vocabulary'
import {
  BRAND_VOICES,
  INDUSTRIES,
  type BrandVoice,
  type BusinessMember,
  type Industry,
  type PlanKey,
  type Profile,
  type Service,
} from '@/domain/types'
import { useAuth } from '@/features/auth/auth-context'
import { useBusiness } from '@/features/businesses/business-context'
import { useEditableDraft } from '@/hooks/use-editable-draft'
import { cn, formatCurrency, formatDate, initials } from '@/lib/utils'

export function SettingsPage() {
  const { activeBusiness, canManage } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const checkout = searchParams.get('checkout')

  // Stripe redirige aquí con ?checkout=success|cancel al volver del
  // checkout — antes esto se ignoraba del todo: la pestaña seguía en
  // "Negocio" (nunca saltaba a Facturación) y la suscripción, aunque el
  // webhook ya la hubiera actualizado, podía seguir en caché con el plan
  // viejo hasta que algo la invalidara. Un solo efecto, una vez, resuelve
  // las dos cosas y limpia el parámetro para que un refresco de página no
  // repita el aviso.
  useEffect(() => {
    if (!checkout) return

    if (checkout === 'success') {
      toast.success('Pago confirmado — tu plan ya está actualizado')
      queryClient.invalidateQueries({ queryKey: ['subscription', businessId] })
    } else if (checkout === 'cancel') {
      toast.info('Pago cancelado, no se ha hecho ningún cargo')
    }

    setSearchParams((params) => {
      params.delete('checkout')
      return params
    }, { replace: true })
    // Solo debe repetirse cuando cambia el propio parámetro de la URL, no
    // cada vez que cambien queryClient/businessId/setSearchParams.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkout])

  return (
    <div className="space-y-6">
      <PageHeader title="Ajustes" description="Tu negocio, tus servicios y tu equipo." />

      <Tabs defaultValue={checkout ? 'facturacion' : 'negocio'}>
        <TabsList>
          <TabsTrigger value="negocio">
            <Building2 />
            Negocio
          </TabsTrigger>
          <TabsTrigger value="servicios">
            <Plus />
            Servicios
          </TabsTrigger>
          <TabsTrigger value="equipo">
            <Users />
            Equipo
          </TabsTrigger>
          <TabsTrigger value="cuenta">
            <UserRound />
            Mi cuenta
          </TabsTrigger>
          <TabsTrigger value="facturacion">
            <CreditCard />
            Facturación
          </TabsTrigger>
        </TabsList>

        <TabsContent value="negocio">
          <BusinessSettings businessId={businessId} canManage={canManage} />
        </TabsContent>
        <TabsContent value="servicios">
          <ServicesSettings businessId={businessId} />
        </TabsContent>
        <TabsContent value="equipo">
          <TeamSettings businessId={businessId} canManage={canManage} />
        </TabsContent>
        <TabsContent value="cuenta">
          <AccountSettings />
        </TabsContent>
        <TabsContent value="facturacion">
          <BillingSettings businessId={businessId} canManage={canManage} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function BusinessSettings({ businessId, canManage }: { businessId: string; canManage: boolean }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { role, refresh } = useBusiness()
  const query = useQuery({
    queryKey: ['business-profile', businessId],
    queryFn: () => businessProfileRepository.get(businessId),
    enabled: Boolean(businessId),
  })

  const [draft, update] = useEditableDraft(query.data ?? undefined, businessId)

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error('Nada que guardar')

      await businessesRepository.update(businessId, {
        name: draft.business_name,
        industry: draft.industry,
        website: draft.website,
        description: draft.description,
      })

      const { id: _id, created_at: _created, updated_at: _updated, ...rest } = draft
      return businessProfileRepository.upsert(rest)
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['business-profile', businessId] })
      await refresh()
      toast.success('Cambios guardados')
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No hemos podido guardar.'),
  })

  const [confirmingDeleteBusiness, setConfirmingDeleteBusiness] = useState(false)

  const exportData = useMutation({
    mutationFn: () => dataExportService.exportBusiness(businessId),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const nameSlug = (draft?.business_name ?? businessId).toLowerCase().replace(/[^a-z0-9]+/g, '-')
      link.download = `sinaptkis-${nameSlug}-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      toast.success('Descarga lista')
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No hemos podido preparar la descarga.'),
  })

  const removeBusiness = useMutation({
    mutationFn: () => businessService.remove(businessId),
    onSuccess: async () => {
      await refresh()
      toast.success('Negocio eliminado')
      navigate('/app', { replace: true })
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No hemos podido eliminar el negocio.'),
  })

  if (query.isLoading) return <LoadingState />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (!draft) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Todavía no has completado la configuración de tu negocio.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Información general</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="businessName">Nombre</Label>
            <Input
              id="businessName"
              disabled={!canManage}
              value={draft.business_name}
              onChange={(e) => update({ business_name: e.target.value })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Sector</Label>
              <Select
                value={draft.industry}
                disabled={!canManage}
                onValueChange={(value) => update({ industry: value as Industry })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((key) => (
                    <SelectItem key={key} value={key}>
                      {INDUSTRY_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="location">Ubicación</Label>
              <Input
                id="location"
                disabled={!canManage}
                value={draft.location ?? ''}
                onChange={(e) => update({ location: e.target.value || null })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="website">Web</Label>
            <Input
              id="website"
              type="url"
              disabled={!canManage}
              value={draft.website ?? ''}
              onChange={(e) => update({ website: e.target.value || null })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Qué hace tu empresa</Label>
            <Textarea
              id="description"
              rows={5}
              disabled={!canManage}
              value={draft.description ?? ''}
              onChange={(e) => update({ description: e.target.value || null })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="idealCustomer">Cliente ideal</Label>
            <Textarea
              id="idealCustomer"
              rows={4}
              disabled={!canManage}
              value={draft.ideal_customer ?? ''}
              onChange={(e) => update({ ideal_customer: e.target.value || null })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="valueProposition">Qué te diferencia</Label>
            <Textarea
              id="valueProposition"
              rows={3}
              disabled={!canManage}
              value={draft.value_proposition ?? ''}
              onChange={(e) => update({ value_proposition: e.target.value || null })}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Tono</Label>
            <Select
              value={draft.brand_voice}
              disabled={!canManage}
              onValueChange={(value) => update({ brand_voice: value as BrandVoice })}
            >
              <SelectTrigger className="max-w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BRAND_VOICES.map((voice) => (
                  <SelectItem key={voice} value={voice}>
                    {BRAND_VOICE_LABELS[voice]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="policies">Condiciones y políticas</Label>
            <Textarea
              id="policies"
              rows={4}
              disabled={!canManage}
              value={draft.policies ?? ''}
              onChange={(e) => update({ policies: e.target.value || null })}
              placeholder="Cancelaciones, garantías, formas de pago…"
            />
            <p className="text-xs text-muted-foreground">
              Tus agentes se ceñirán a esto y no improvisarán excepciones.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Tus objetivos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {draft.goals.map((goal) => (
              <Badge key={goal} variant="secondary">
                {GOAL_LABELS[goal]}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {canManage && (
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          Guardar cambios
        </Button>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Tus datos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Exportar todos tus datos</p>
              <p className="text-xs text-muted-foreground">
                Un archivo con tu negocio, contactos, conversaciones, citas, automatizaciones y
                agentes — tal cual están hoy.
              </p>
            </div>
            <Button variant="outline" size="sm" loading={exportData.isPending} onClick={() => exportData.mutate()}>
              <Download />
              Descargar
            </Button>
          </div>

          {role === 'owner' && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <div>
                <p className="text-sm font-medium text-destructive">Eliminar este negocio</p>
                <p className="text-xs text-muted-foreground">
                  Borra el negocio y todo lo que contiene — contactos, conversaciones,
                  automatizaciones (y sus workflows en el motor), agentes, citas. No se puede
                  deshacer.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-destructive text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmingDeleteBusiness(true)}
              >
                <Trash2 />
                Eliminar negocio
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmingDeleteBusiness}
        onOpenChange={setConfirmingDeleteBusiness}
        title="Eliminar negocio"
        description={`Vas a eliminar "${draft.business_name}" y todos sus datos: contactos, conversaciones, automatizaciones, agentes y citas. No se puede deshacer.`}
        loading={removeBusiness.isPending}
        onConfirm={() => removeBusiness.mutate()}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */

function ServicesSettings({ businessId }: { businessId: string }) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['services', businessId],
    queryFn: () => businessProfileRepository.listServices(businessId),
    enabled: Boolean(businessId),
  })

  const create = useMutation({
    mutationFn: () =>
      businessProfileRepository.createService({
        business_id: businessId,
        name: 'Nuevo servicio',
        description: null,
        price: null,
        currency: 'EUR',
        duration_minutes: null,
        url: null,
        features: [],
        is_active: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services', businessId] })
    },
  })

  if (query.isLoading) return <LoadingState />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />

  const services = query.data ?? []

  return (
    <div className="space-y-4">
      {services.map((service) => (
        <ServiceRow key={service.id} service={service} businessId={businessId} />
      ))}

      <Button variant="outline" className="w-full" loading={create.isPending} onClick={() => create.mutate()}>
        <Plus />
        Añadir servicio
      </Button>
    </div>
  )
}

function ServiceRow({ service, businessId }: { service: Service; businessId: string }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(service)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const save = useMutation({
    mutationFn: () =>
      businessProfileRepository.updateService(service.id, {
        name: draft.name,
        description: draft.description,
        price: draft.price,
        duration_minutes: draft.duration_minutes,
        url: draft.url,
        features: draft.features,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services', businessId] })
      toast.success('Servicio guardado')
    },
  })

  const remove = useMutation({
    mutationFn: () => businessProfileRepository.removeService(service.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services', businessId] })
      toast.success('Servicio eliminado')
    },
  })

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{draft.name || 'Sin nombre'}</p>
        <div className="flex items-center gap-2">
          <span className="text-sm tabular-nums text-muted-foreground">
            {formatCurrency(draft.price, draft.currency)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setConfirmingDelete(true)}
            aria-label="Eliminar servicio"
          >
            <Trash2 className="text-muted-foreground" />
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`svc-name-${service.id}`}>Nombre</Label>
          <Input
            id={`svc-name-${service.id}`}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`svc-desc-${service.id}`}>Descripción</Label>
          <Textarea
            id={`svc-desc-${service.id}`}
            rows={2}
            value={draft.description ?? ''}
            onChange={(e) => setDraft({ ...draft, description: e.target.value || null })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`svc-price-${service.id}`}>Precio (€)</Label>
            <Input
              id={`svc-price-${service.id}`}
              type="number"
              min="0"
              step="0.01"
              value={draft.price ?? ''}
              onChange={(e) =>
                setDraft({ ...draft, price: e.target.value ? Number(e.target.value) : null })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`svc-duration-${service.id}`}>Duración (min)</Label>
            <Input
              id={`svc-duration-${service.id}`}
              type="number"
              min="0"
              value={draft.duration_minutes ?? ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  duration_minutes: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`svc-features-${service.id}`}>Qué incluye (separa con comas)</Label>
          <Input
            id={`svc-features-${service.id}`}
            value={draft.features.join(', ')}
            onChange={(e) =>
              setDraft({
                ...draft,
                features: e.target.value
                  .split(',')
                  .map((f) => f.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>

        <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>
          Guardar
        </Button>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Eliminar servicio"
        description={`Vas a eliminar "${draft.name || 'este servicio'}" y no se puede deshacer.`}
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </Card>
  )
}

/* ------------------------------------------------------------------ */

function TeamSettings({ businessId, canManage }: { businessId: string; canManage: boolean }) {
  const [inviting, setInviting] = useState(false)
  const { user } = useAuth()

  const query = useQuery({
    queryKey: ['members', businessId],
    queryFn: () => businessesRepository.listMembers(businessId),
    enabled: Boolean(businessId),
  })

  const invitesQuery = useQuery({
    queryKey: ['invites', businessId],
    queryFn: () => teamInvitesRepository.listPending(businessId),
    enabled: Boolean(businessId) && canManage,
  })

  if (query.isLoading) return <LoadingState />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />

  const members = query.data ?? []
  const invites = invitesQuery.data ?? []

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm">Personas con acceso</CardTitle>
          {canManage && (
            <Button size="sm" onClick={() => setInviting(true)}>
              <UserPlus />
              Invitar
            </Button>
          )}
        </CardHeader>
        <CardContent className="divide-y">
          {members.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              businessId={businessId}
              // Ni el propio dueño ni tú mismo os podéis quitar u ocultar acceso
              // desde aquí — la transferencia de propiedad es otra funcionalidad,
              // y quitarte tu propio acceso por error sería difícil de deshacer.
              canManage={canManage && member.role !== 'owner' && member.user_id !== user?.id}
            />
          ))}
        </CardContent>
      </Card>

      {canManage && invites.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Invitaciones pendientes</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {invites.map((invite) => (
              <PendingInviteRow key={invite.id} invite={invite} businessId={businessId} />
            ))}
          </CardContent>
        </Card>
      )}

      <InviteDialog open={inviting} onOpenChange={setInviting} businessId={businessId} />
    </div>
  )
}

function MemberRow({
  member,
  businessId,
  canManage,
}: {
  member: BusinessMember & { profile: Profile | null }
  businessId: string
  canManage: boolean
}) {
  const queryClient = useQueryClient()
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const name = member.profile?.full_name ?? member.profile?.email ?? 'Sin nombre'

  const changeRole = useMutation({
    mutationFn: (role: 'admin' | 'member') => businessesRepository.updateMemberRole(member.id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', businessId] })
      toast.success('Rol actualizado')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No hemos podido cambiar el rol.'),
  })

  const remove = useMutation({
    mutationFn: () => businessesRepository.removeMember(member.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', businessId] })
      toast.success(`${name} ya no tiene acceso a este negocio`)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No hemos podido quitar el acceso.'),
  })

  return (
    <div className="flex items-center gap-3 py-3">
      <Avatar className="h-8 w-8">
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{member.profile?.email}</p>
      </div>

      {canManage ? (
        <>
          <Select
            value={member.role}
            onValueChange={(value) => changeRole.mutate(value as 'admin' | 'member')}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Miembro</SelectItem>
              <SelectItem value="admin">Administrador</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setConfirmingRemove(true)}>
            Quitar acceso
          </Button>
          <ConfirmDialog
            open={confirmingRemove}
            onOpenChange={setConfirmingRemove}
            title="Quitar acceso"
            description={`${name} dejará de poder entrar a este negocio.`}
            confirmLabel="Quitar acceso"
            loading={remove.isPending}
            onConfirm={() => remove.mutate()}
          />
        </>
      ) : (
        <Badge variant="secondary">{MEMBER_ROLE_LABELS[member.role]}</Badge>
      )}
    </div>
  )
}

function PendingInviteRow({ invite, businessId }: { invite: PendingInvite; businessId: string }) {
  const queryClient = useQueryClient()

  const revoke = useMutation({
    mutationFn: () => teamInvitesRepository.revoke(invite.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invites', businessId] })
      toast.success('Invitación revocada')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No hemos podido revocarla.'),
  })

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary">
        <Mail className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{invite.email}</p>
        <p className="truncate text-xs text-muted-foreground">
          Invitado {formatDate(invite.created_at)} · caduca {formatDate(invite.expires_at)}
        </p>
      </div>
      <Badge variant="secondary">{MEMBER_ROLE_LABELS[invite.role]}</Badge>
      <Button variant="ghost" size="sm" loading={revoke.isPending} onClick={() => revoke.mutate()}>
        Revocar
      </Button>
    </div>
  )
}

const inviteSchema = z.object({
  email: z.string().trim().min(1, 'Escribe un email.').email('Escribe un email válido.'),
  role: z.enum(['admin', 'member']),
})

type InviteValues = z.infer<typeof inviteSchema>

function InviteDialog({
  open,
  onOpenChange,
  businessId,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  businessId: string
}) {
  const queryClient = useQueryClient()
  const [result, setResult] = useState<{ inviteUrl: string; emailSent: boolean } | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'member' },
  })

  function close(nextOpen: boolean) {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      reset()
      setResult(null)
    }
  }

  async function onSubmit(values: InviteValues) {
    try {
      const invite = await teamInvitesRepository.invite(businessId, values.email, values.role)
      queryClient.invalidateQueries({ queryKey: ['invites', businessId] })
      setResult(invite)
      toast.success(invite.emailSent ? 'Invitación enviada' : 'Invitación creada')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No hemos podido invitar.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Invitar a alguien</DialogTitle>
          <DialogDescription>
            Le mandamos un email con un enlace para unirse a este negocio.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {result.emailSent
                ? 'Ya le hemos enviado el email. También puedes compartir este enlace a mano:'
                : 'No hemos podido enviarle el email (revisa la configuración de Resend) — comparte este enlace a mano:'}
            </p>
            <div className="flex items-center gap-2">
              <Input readOnly value={result.inviteUrl} className="text-xs" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(result.inviteUrl)
                  toast.success('Enlace copiado')
                }}
              >
                <Copy />
              </Button>
            </div>
            <Button className="w-full" onClick={() => close(false)}>
              Listo
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="inviteEmail">Email</Label>
              <Input
                id="inviteEmail"
                type="email"
                placeholder="persona@empresa.com"
                aria-invalid={Boolean(errors.email)}
                {...register('email')}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select value={watch('role')} onValueChange={(value) => setValue('role', value as InviteValues['role'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Miembro</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={isSubmitting}>
                Invitar
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */

function AccountSettings() {
  const { profile, user, refreshProfile } = useAuth()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('No hay sesión iniciada.')
      return businessesRepository.updateProfile(user.id, { full_name: fullName.trim() })
    },
    onSuccess: async () => {
      // El guardado ya se completó; si falla el refetch del perfil en el
      // contexto (red, RLS...), no es un fallo del guardado en sí.
      await refreshProfile().catch(() => undefined)
      toast.success('Perfil actualizado')
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No hemos podido guardar.'),
  })

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Tu perfil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="profileName">Nombre</Label>
            <Input
              id="profileName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="max-w-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={user?.email ?? ''} disabled className="max-w-sm" />
          </div>

          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Guardar
          </Button>
        </CardContent>
      </Card>

      <ChangePasswordCard />
    </div>
  )
}

const MIN_PASSWORD_LENGTH = 8

function ChangePasswordCard() {
  const { updatePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  const change = useMutation({
    mutationFn: async () => {
      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`)
      }
      if (password !== confirm) throw new Error('Las contraseñas no coinciden.')
      await updatePassword(password)
    },
    onSuccess: () => {
      setPassword('')
      setConfirm('')
      setError(null)
      toast.success('Contraseña actualizada')
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'No hemos podido cambiarla.'
      setError(message)
      toast.error(message)
    },
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Cambiar contraseña</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:max-w-lg sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="newPassword">Contraseña nueva</Label>
            <PasswordInput
              id="newPassword"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Repítela</Label>
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          loading={change.isPending}
          disabled={!password || !confirm}
          onClick={() => change.mutate()}
        >
          Actualizar contraseña
        </Button>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */

const PLAN_ORDER: PlanKey[] = ['starter', 'growth', 'scale']

/**
 * Precio de referencia por plan (los mismos importes creados en Stripe).
 * Cambiar el precio en Stripe no actualiza esto solo — es texto de la
 * página, no un valor que se lea de la API en cada carga.
 */
const PLAN_PRICES: Record<PlanKey, number> = {
  starter: 29,
  growth: 79,
  scale: 199,
}

/**
 * Lo que de verdad incluye cada plan a día de hoy, no una lista aspiracional.
 * Las cifras de automatizaciones/agentes salen de `PLAN_LIMITS` — es la misma
 * tabla que `plan-quota.ts` usa para bloquear la activación de más: cambiar
 * un número aquí sin cambiarlo allí (o al revés) ya no es posible.
 */
const PLAN_FEATURES: Record<PlanKey, string[]> = {
  starter: [
    '1 negocio',
    `Hasta ${PLAN_LIMITS.starter.maxActiveAutomations} automatizaciones activas`,
    `${PLAN_LIMITS.starter.maxActiveAgents} agente IA (Recepcionista)`,
    'CRM con pipeline y puntuación de potencial',
    'Canal: Telegram',
    'Base de conocimiento con búsqueda por palabra clave',
  ],
  growth: [
    'Todo lo de Starter',
    'Automatizaciones activas ilimitadas',
    `Hasta ${PLAN_LIMITS.growth.maxActiveAgents} agentes IA (Recepcionista, Comercial, Seguimiento)`,
    'Agendar citas con Google Calendar',
    'Campañas por email (recordatorios y reactivación)',
    'Búsqueda semántica en la base de conocimiento',
  ],
  scale: [
    'Todo lo de Growth',
    'Agentes IA ilimitados, incluido Soporte',
    'Analíticas avanzadas del negocio',
    'Historial y auditoría completa de ejecuciones',
    'Soporte prioritario',
  ],
}

const RECOMMENDED_PLAN: PlanKey = 'growth'

function BillingSettings({ businessId, canManage }: { businessId: string; canManage: boolean }) {
  const query = useQuery({
    queryKey: ['subscription', businessId],
    queryFn: () => subscriptionsRepository.getByBusiness(businessId),
    enabled: Boolean(businessId),
  })

  const checkout = useMutation({
    mutationFn: (plan: PlanKey) => stripeService.goToCheckout(businessId, plan),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No hemos podido abrir el checkout.'),
  })

  const portal = useMutation({
    mutationFn: () => stripeService.goToBillingPortal(businessId),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No hemos podido abrir el portal.'),
  })

  if (query.isLoading) return <LoadingState />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />

  const subscription = query.data

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Plan y facturación</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {subscription ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
            <div className="flex-1">
              <p className="text-sm font-semibold">{PLAN_LABELS[subscription.plan]}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
                {subscription.current_period_end &&
                  ` · Renueva ${new Date(subscription.current_period_end).toLocaleDateString('es-ES')}`}
                {subscription.trial_ends_at &&
                  subscription.status === 'trial' &&
                  ` · Prueba hasta ${new Date(subscription.trial_ends_at).toLocaleDateString('es-ES')}`}
              </p>
            </div>
            {canManage && subscription.stripe_customer_id && (
              <Button
                variant="outline"
                size="sm"
                loading={portal.isPending}
                onClick={() => portal.mutate()}
              >
                <ExternalLink />
                Gestionar facturación
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Este negocio todavía no tiene un plan asignado.</p>
        )}

        {canManage && (
          <div className="grid gap-4 sm:grid-cols-3">
            {PLAN_ORDER.map((plan) => {
              const isCurrent = subscription?.plan === plan && subscription.status === 'activa'
              const isRecommended = plan === RECOMMENDED_PLAN

              return (
                <div
                  key={plan}
                  className={cn(
                    'flex flex-col gap-4 rounded-lg border p-4',
                    isRecommended && 'border-primary shadow-sm',
                  )}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{PLAN_LABELS[plan]}</p>
                      {isRecommended && <Badge>Recomendado</Badge>}
                    </div>
                    <p className="text-2xl font-semibold tabular-nums">
                      {formatCurrency(PLAN_PRICES[plan])}
                      <span className="text-sm font-normal text-muted-foreground">/mes</span>
                    </p>
                  </div>

                  <ul className="flex-1 space-y-2">
                    {PLAN_FEATURES[plan].map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Button
                    size="sm"
                    variant={isCurrent ? 'outline' : isRecommended ? 'default' : 'outline'}
                    disabled={isCurrent}
                    loading={checkout.isPending}
                    onClick={() => checkout.mutate(plan)}
                  >
                    {isCurrent ? 'Plan actual' : 'Elegir plan'}
                  </Button>
                </div>
              )
            })}
          </div>
        )}

        <p className="rounded-md bg-secondary/60 p-3 text-xs text-muted-foreground">
          La facturación real se procesa con Stripe. Si tu cuenta todavía no tiene Stripe conectado,
          estos botones te lo dirán claramente en vez de simular un pago.
        </p>
      </CardContent>
    </Card>
  )
}
