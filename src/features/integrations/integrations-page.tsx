import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AtSign,
  Bot,
  Calendar,
  Camera,
  CreditCard,
  Database,
  ExternalLink,
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
import { PageHeader } from '@/components/shared/page-header'
import { CardGridSkeleton, ErrorState } from '@/components/shared/states'
import { integrationsRepository } from '@/services/repositories/integrations.repository'
import { telegramService } from '@/services/channels/telegram.service'
import { isN8nLive } from '@/services/n8n'
import { supabase } from '@/services/supabase/client'
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
  'telegram',
  'gmail',
  'google_calendar',
  'instagram',
  'facebook',
  'stripe',
]

/**
 * De momento el producto se centra en Telegram como canal de mensajería.
 * WhatsApp exige verificación de empresa con Meta — un trámite que solo
 * puede iniciar el propio negocio, no algo que se resuelva con código. Se
 * oculta del marketplace mientras tanto: mostrar una tarjeta que nadie puede
 * completar hoy no ayuda a nadie. Sigue existiendo como proveedor válido —
 * basta con quitarlo de aquí cuando se retome.
 */
const HIDDEN_FOR_NOW: IntegrationProvider[] = ['whatsapp']

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
  const platform = INTEGRATION_PROVIDERS.filter(
    (p) => !CUSTOMER_FACING.includes(p) && !HIDDEN_FOR_NOW.includes(p),
  )

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
  const [connectOpen, setConnectOpen] = useState(false)

  // El motor lo configura la plataforma, no cada negocio: su estado real es si
  // hay backend detrás, no lo que diga la fila de la base de datos.
  const isEngine = provider === 'n8n'
  // Telegram guarda una credencial real (el token del bot) y de verdad envía
  // mensajes al conectarse — no solo apunta la intención como el resto.
  const isTelegram = provider === 'telegram'
  // Google Calendar usa OAuth de verdad (google-calendar-oauth Edge
  // Function) en vez del placeholder "conectando" del resto.
  const isGoogleCalendar = provider === 'google_calendar'
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

  const connectGoogleCalendar = useMutation({
    mutationFn: async () => {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined
      if (!apiBaseUrl) throw new Error('Todavía no hay un backend conectado para gestionar canales.')

      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Sesión no válida')

      // El JWT de sesión no viaja por la URL: se cambia aquí, con un fetch
      // autenticado normal, por un código de un solo uso y 2 minutos de
      // vida — eso es lo único que lleva la navegación del navegador.
      const mintResponse = await fetch(`${apiBaseUrl}/google-calendar-oauth/mint-start-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ businessId }),
      })
      if (!mintResponse.ok) {
        const payload = await mintResponse.json().catch(() => ({}) as { error?: string })
        throw new Error(payload.error ?? 'No hemos podido iniciar la conexión con Google.')
      }
      const { code } = (await mintResponse.json()) as { code: string }

      // Navegación real del navegador, no un fetch: Google necesita
      // redirigir de verdad al consentimiento y volver — un XHR no puede
      // llevar al usuario a esa pantalla.
      window.location.href = `${apiBaseUrl}/google-calendar-oauth/start?businessId=${businessId}&code=${code}`
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No hemos podido iniciar la conexión.'),
  })

  const disconnectTelegram = useMutation({
    mutationFn: () => telegramService.disconnect(businessId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations', businessId] })
      toast.success('Telegram desconectado')
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No hemos podido desconectar Telegram.'),
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
        {isTelegram && typeof integration?.config?.bot_username === 'string' && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Conectado como @{integration.config.bot_username}
          </p>
        )}
        {integration?.connected_at && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Conectado {formatRelative(integration.connected_at)}
          </p>
        )}
        {integration?.last_error && (
          <p className="mt-2 text-xs text-destructive">{integration.last_error}</p>
        )}
        {status === 'conectando' && !isTelegram && !isGoogleCalendar && (
          <p className="mt-2 text-xs text-muted-foreground">
            Te avisaremos en cuanto esté disponible.
          </p>
        )}
        {status === 'conectando' && isGoogleCalendar && (
          <p className="mt-2 text-xs text-muted-foreground">Autorizando con Google…</p>
        )}
      </div>

      {isEngine ? (
        <p className="mt-4 rounded-md bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
          {isN8nLive
            ? 'Lo gestiona Sinaptkis. Tus automatizaciones ya se ejecutan de verdad.'
            : 'Lo gestiona Sinaptkis. Todavía no está activo en tu cuenta.'}
        </p>
      ) : isTelegram ? (
        <>
          <Button
            variant={status === 'conectado' ? 'outline' : 'default'}
            size="sm"
            className="mt-4 w-full"
            loading={disconnectTelegram.isPending}
            onClick={() => (status === 'conectado' ? disconnectTelegram.mutate() : setConnectOpen(true))}
          >
            {status === 'conectado' ? 'Desconectar' : 'Conectar'}
          </Button>
          <ConnectTelegramDialog
            open={connectOpen}
            onOpenChange={setConnectOpen}
            businessId={businessId}
          />
        </>
      ) : isGoogleCalendar ? (
        <Button
          variant={status === 'conectado' ? 'outline' : 'default'}
          size="sm"
          className="mt-4 w-full"
          loading={connectGoogleCalendar.isPending}
          onClick={() =>
            status === 'conectado'
              ? integrationsRepository
                  .setStatus(businessId, provider, 'no_conectado')
                  .then(() => queryClient.invalidateQueries({ queryKey: ['integrations', businessId] }))
              : connectGoogleCalendar.mutate()
          }
        >
          {status === 'conectado' ? 'Desconectar' : 'Conectar con Google'}
        </Button>
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

const connectTelegramSchema = z.object({
  botToken: z.string().trim().min(1, 'Pega el token que te da BotFather.'),
})

type ConnectTelegramValues = z.infer<typeof connectTelegramSchema>

function ConnectTelegramDialog({
  open,
  onOpenChange,
  businessId,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  businessId: string
}) {
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ConnectTelegramValues>({
    resolver: zodResolver(connectTelegramSchema),
    defaultValues: { botToken: '' },
  })

  const connect = useMutation({
    mutationFn: (values: ConnectTelegramValues) => telegramService.connect(businessId, values.botToken),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['integrations', businessId] })
      toast.success(`Telegram conectado — tu bot es @${result.botUsername}`)
      reset()
      onOpenChange(false)
    },
    onError: (caught) =>
      setError('root', {
        message: caught instanceof Error ? caught.message : 'No hemos podido conectar Telegram.',
      }),
  })

  function onSubmit(values: ConnectTelegramValues) {
    connect.mutate(values)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conectar Telegram</DialogTitle>
          <DialogDescription>
            Necesitas un bot de Telegram. Se crea gratis y en menos de un minuto.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-secondary/40 p-3 text-xs leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">Cómo conseguir el token</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4">
            <li>
              Abre{' '}
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                @BotFather en Telegram
                <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li>
              Escríbele <code className="rounded bg-background px-1 py-0.5">/newbot</code> y sigue
              sus instrucciones
            </li>
            <li>Te dará un token — pégalo aquí abajo</li>
          </ol>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="botToken">Token del bot</Label>
            <Input
              id="botToken"
              type="password"
              autoComplete="off"
              placeholder="123456789:AAExampleTokenFromBotFather"
              autoFocus
              aria-invalid={Boolean(errors.botToken)}
              {...register('botToken')}
            />
            <p className="text-xs text-muted-foreground">
              No se guarda en texto plano visible ni vuelve a mostrarse una vez conectado.
            </p>
            {errors.botToken && <p className="text-xs text-destructive">{errors.botToken.message}</p>}
          </div>

          {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting || connect.isPending}>
              Conectar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
