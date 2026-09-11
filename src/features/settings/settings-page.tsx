import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, CreditCard, ExternalLink, Plus, Trash2, UserRound, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
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
import { Avatar, AvatarFallback, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc'
import { PageHeader } from '@/components/shared/page-header'
import { ErrorState, LoadingState } from '@/components/shared/states'
import { businessesRepository } from '@/services/repositories/businesses.repository'
import { businessProfileRepository } from '@/services/repositories/business-profile.repository'
import { subscriptionsRepository } from '@/services/repositories/subscriptions.repository'
import { stripeService } from '@/services/billing/stripe.service'
import {
  BRAND_VOICE_LABELS,
  GOAL_LABELS,
  INDUSTRY_LABELS,
  PLAN_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
} from '@/domain/vocabulary'
import {
  BRAND_VOICES,
  INDUSTRIES,
  type BrandVoice,
  type Industry,
  type MemberRole,
  type PlanKey,
  type Service,
} from '@/domain/types'
import { useAuth } from '@/features/auth/auth-context'
import { useBusiness } from '@/features/businesses/business-context'
import { useEditableDraft } from '@/hooks/use-editable-draft'
import { formatCurrency, initials } from '@/lib/utils'

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  member: 'Miembro',
}

export function SettingsPage() {
  const { activeBusiness, canManage } = useBusiness()
  const businessId = activeBusiness?.id ?? ''

  return (
    <div className="space-y-6">
      <PageHeader title="Ajustes" description="Tu negocio, tus servicios y tu equipo." />

      <Tabs defaultValue="negocio">
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
  const { refresh } = useBusiness()
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
            loading={remove.isPending}
            onClick={() => remove.mutate()}
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
    </Card>
  )
}

/* ------------------------------------------------------------------ */

function TeamSettings({ businessId, canManage }: { businessId: string; canManage: boolean }) {
  const query = useQuery({
    queryKey: ['members', businessId],
    queryFn: () => businessesRepository.listMembers(businessId),
    enabled: Boolean(businessId),
  })

  if (query.isLoading) return <LoadingState />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />

  const members = query.data ?? []

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Personas con acceso</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        {members.map((member) => {
          const name = member.profile?.full_name ?? member.profile?.email ?? 'Sin nombre'
          return (
            <div key={member.id} className="flex items-center gap-3 py-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{initials(name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{name}</p>
                <p className="truncate text-xs text-muted-foreground">{member.profile?.email}</p>
              </div>
              <Badge variant="secondary">{ROLE_LABELS[member.role]}</Badge>
            </div>
          )
        })}

        {canManage && (
          <p className="pt-4 text-xs text-muted-foreground">
            Podrás invitar a más personas cuando conectemos el envío de correos.
          </p>
        )}
      </CardContent>
    </Card>
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
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Repítela</Label>
            <Input
              id="confirmPassword"
              type="password"
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
          <div className="grid gap-3 sm:grid-cols-3">
            {PLAN_ORDER.map((plan) => (
              <div key={plan} className="flex flex-col gap-2 rounded-lg border p-4">
                <p className="text-sm font-semibold">{PLAN_LABELS[plan]}</p>
                <Button
                  size="sm"
                  variant={subscription?.plan === plan ? 'outline' : 'default'}
                  disabled={subscription?.plan === plan && subscription.status === 'activa'}
                  loading={checkout.isPending}
                  onClick={() => checkout.mutate(plan)}
                >
                  {subscription?.plan === plan && subscription.status === 'activa'
                    ? 'Plan actual'
                    : 'Elegir plan'}
                </Button>
              </div>
            ))}
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
