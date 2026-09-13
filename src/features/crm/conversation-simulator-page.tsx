/**
 * Simulador de conversación.
 *
 * Deja probar cómo atiende un agente y, sobre todo, ver cómo se valora el
 * potencial de un contacto a medida que habla. La misma puntuación se aplicará
 * a las conversaciones reales de WhatsApp o Telegram cuando esos canales estén
 * conectados: aquí solo cambia de dónde vienen los mensajes.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Bot,
  Loader2,
  Phone,
  RotateCcw,
  Send,
  Sparkles,
  User,
} from 'lucide-react'
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
import { Separator } from '@/components/ui/misc'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/states'
import { agentsRepository } from '@/services/repositories/agents.repository'
import { businessProfileRepository } from '@/services/repositories/business-profile.repository'
import { leadsRepository } from '@/services/repositories/leads.repository'
import { activityRepository } from '@/services/repositories/activity.repository'
import { aiService } from '@/services/ai'
import { scoreLead, type ScoredMessage } from '@/domain/engine/lead-scoring'
import { CHANNEL_LABELS } from '@/domain/vocabulary'
import type { AiAgent, ContactChannel } from '@/domain/types'
import { useBusiness } from '@/features/businesses/business-context'
import { cn } from '@/lib/utils'
import { PotentialBadge, PotentialBar } from './potential-badge'

/** Canales donde tiene sentido una conversación de ida y vuelta. */
const SIMULATABLE_CHANNELS: ContactChannel[] = [
  'telegram',
  'whatsapp',
  'telefono',
  'web',
  'instagram',
  'email',
]

interface SimMessage extends ScoredMessage {
  id: string
}

export function ConversationSimulatorPage() {
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const navigate = useNavigate()

  const [channel, setChannel] = useState<ContactChannel>('telegram')
  const [agentId, setAgentId] = useState<string>('')
  const [messages, setMessages] = useState<SimMessage[]>([])
  const [draft, setDraft] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [startedAt] = useState(() => Date.now())
  const bottomRef = useRef<HTMLDivElement>(null)

  const agentsQuery = useQuery({
    queryKey: ['agents', businessId],
    queryFn: () => agentsRepository.list(businessId),
    enabled: Boolean(businessId),
  })

  const profileQuery = useQuery({
    queryKey: ['business-profile', businessId],
    queryFn: () => businessProfileRepository.get(businessId),
    enabled: Boolean(businessId),
  })

  const servicesQuery = useQuery({
    queryKey: ['services', businessId],
    queryFn: () => businessProfileRepository.listServices(businessId),
    enabled: Boolean(businessId),
  })

  const agents = useMemo(() => agentsQuery.data ?? [], [agentsQuery.data])
  const agent: AiAgent | undefined =
    agents.find((a) => a.id === agentId) ?? agents[0]

  useEffect(() => {
    if (!agentId && agents.length > 0) setAgentId(agents[0].id)
  }, [agents, agentId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // La puntuación se recalcula en cada mensaje: el usuario ve cómo se mueve.
  // La duración de llamada sale del `created_at` del último mensaje (no de
  // `Date.now()` en el propio render) para que el cálculo sea puro y no
  // dependa de cuándo React decida repetir el render.
  const score = useMemo(() => {
    if (messages.length === 0) return null
    const lastMessageAt = messages[messages.length - 1].created_at
    return scoreLead({
      messages,
      channel,
      callDurationSeconds:
        channel === 'telefono'
          ? Math.round((new Date(lastMessageAt).getTime() - startedAt) / 1000)
          : undefined,
      sharedContactDetails: Boolean(contactEmail.trim() || contactPhone.trim()),
    })
  }, [messages, channel, startedAt, contactEmail, contactPhone])

  const send = useMutation({
    mutationFn: async (text: string) => {
      const profile = profileQuery.data
      const services = servicesQuery.data ?? []
      if (!profile || !agent) throw new Error('Falta la información del negocio.')

      const now = new Date().toISOString()
      const contactMessage: SimMessage = {
        id: crypto.randomUUID(),
        role: 'contacto',
        content: text,
        created_at: now,
      }

      setMessages((prev) => [...prev, contactMessage])
      setDraft('')

      const reply = await aiService.generateReply({
        agent,
        profile,
        services,
        history: [...messages, contactMessage].map((m) => ({
          id: m.id,
          conversation_id: '',
          business_id: businessId,
          role: m.role,
          content: m.content,
          metadata: {},
          created_at: m.created_at,
        })),
        incomingMessage: text,
      })

      return reply
    },
    onSuccess: (reply) => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'agente_ia',
          content: reply,
          created_at: new Date().toISOString(),
        },
      ])
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'El agente no ha podido responder.'),
  })

  const save = useMutation({
    mutationFn: async () => {
      if (!score) throw new Error('Todavía no hay conversación que valorar.')
      return leadsRepository.saveScored({
        businessId,
        fullName: contactName,
        email: contactEmail.trim() || null,
        phone: contactPhone.trim() || null,
        channel,
        score,
      })
    },
    onSuccess: async (lead) => {
      await activityRepository.log({
        businessId,
        action: `Contacto valorado desde ${CHANNEL_LABELS[channel]}: ${lead.full_name} (${score?.score}/100)`,
        entityType: 'lead',
        entityId: lead.id,
        metadata: { potential: score?.label, channel },
      })
      toast.success('Contacto guardado con su valoración')
      navigate(`/app/clientes/${lead.id}`)
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No hemos podido guardar el contacto.'),
  })

  if (agentsQuery.isLoading || profileQuery.isLoading || servicesQuery.isLoading) {
    return <LoadingState />
  }

  // Antes, un fallo de red aquí se veía igual que "todavía no tienes
  // agentes" (agents.length === 0 por defecto) — el aviso decía "créate un
  // agente" cuando el problema real era que la consulta había fallado.
  if (agentsQuery.isError || profileQuery.isError || servicesQuery.isError) {
    return (
      <div className="space-y-6">
        <BackLink />
        <ErrorState
          error={agentsQuery.error ?? profileQuery.error ?? servicesQuery.error}
          onRetry={() => {
            agentsQuery.refetch()
            profileQuery.refetch()
            servicesQuery.refetch()
          }}
        />
      </div>
    )
  }

  if (agents.length === 0) {
    return (
      <div className="space-y-6">
        <BackLink />
        <EmptyState
          icon={Bot}
          title="Necesitas un agente para simular"
          description="Los agentes se crean al generar el sistema de tu negocio."
          action={{ label: 'Ver agentes', onClick: () => navigate('/app/agentes') }}
        />
      </div>
    )
  }

  const canSave = messages.some((m) => m.role === 'contacto')

  return (
    <div className="space-y-6">
      <BackLink />

      <PageHeader
        title="Simular una conversación"
        description="Habla como lo haría un cliente. Verás cómo responde tu agente y cómo se valora su potencial en tiempo real."
        actions={
          messages.length > 0 ? (
            <Button variant="outline" size="sm" onClick={() => setMessages([])}>
              <RotateCcw />
              Empezar de nuevo
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card className="flex h-[560px] flex-col">
          <div className="flex flex-wrap items-center gap-3 border-b p-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="channel" className="text-xs text-muted-foreground">
                Canal
              </Label>
              <Select
                value={channel}
                onValueChange={(v) => setChannel(v as ContactChannel)}
              >
                <SelectTrigger id="channel" className="h-8 w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIMULATABLE_CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CHANNEL_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Label htmlFor="agent" className="text-xs text-muted-foreground">
                Atiende
              </Label>
              <Select value={agent?.id ?? ''} onValueChange={setAgentId}>
                <SelectTrigger id="agent" className="h-8 w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <StarterPrompts
                channel={channel}
                onPick={(text) => send.mutate(text)}
                disabled={send.isPending}
              />
            ) : (
              messages.map((m) => <Bubble key={m.id} message={m} />)
            )}
            {send.isPending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {agent?.name} está escribiendo…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            className="flex gap-2 border-t p-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (draft.trim()) send.mutate(draft.trim())
            }}
          >
            <Textarea
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Escribe como si fueras el cliente…"
              className="min-h-[38px] resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (draft.trim()) send.mutate(draft.trim())
                }
              }}
            />
            <Button type="submit" size="icon" loading={send.isPending} disabled={!draft.trim()}>
              <Send />
            </Button>
          </form>
        </Card>

        <ScorePanel
          score={score}
          channel={channel}
          contactName={contactName}
          contactEmail={contactEmail}
          contactPhone={contactPhone}
          onNameChange={setContactName}
          onEmailChange={setContactEmail}
          onPhoneChange={setContactPhone}
          canSave={canSave}
          saving={save.isPending}
          onSave={() => save.mutate()}
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function BackLink() {
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2">
      <Link to="/app/clientes">
        <ArrowLeft />
        Clientes
      </Link>
    </Button>
  )
}

const STARTERS: Record<string, string[]> = {
  interesado: [
    'Hola, ¿cuánto cuesta un implante?',
    '¿Tenéis hueco esta semana? Me corre bastante prisa',
    'Buenas, quería pedir cita para una revisión',
  ],
  curioso: [
    'Hola, solo quería saber qué hacéis',
    'Estoy mirando precios, por curiosidad',
  ],
}

function StarterPrompts({
  channel,
  onPick,
  disabled,
}: {
  channel: ContactChannel
  onPick(text: string): void
  disabled: boolean
}) {
  return (
    <div className="py-6">
      <div className="mb-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        {channel === 'telefono' ? <Phone className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        Escribe abajo o prueba con uno de estos
      </div>

      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Cliente con intención de compra
          </p>
          <div className="space-y-1.5">
            {STARTERS.interesado.map((text) => (
              <button
                key={text}
                type="button"
                disabled={disabled}
                onClick={() => onPick(text)}
                className="w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:border-primary/40 hover:bg-secondary disabled:opacity-50"
              >
                {text}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Alguien que solo mira
          </p>
          <div className="space-y-1.5">
            {STARTERS.curioso.map((text) => (
              <button
                key={text}
                type="button"
                disabled={disabled}
                onClick={() => onPick(text)}
                className="w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:border-primary/40 hover:bg-secondary disabled:opacity-50"
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Bubble({ message }: { message: SimMessage }) {
  const isContact = message.role === 'contacto'

  return (
    <div className={cn('flex gap-2.5', !isContact && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          isContact ? 'bg-secondary' : 'bg-primary/10',
        )}
      >
        {isContact ? (
          <User className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <Bot className="h-3.5 w-3.5 text-primary" />
        )}
      </div>

      <div
        className={cn(
          'max-w-[78%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed',
          isContact ? 'bg-secondary' : 'bg-primary text-primary-foreground',
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function ScorePanel({
  score,
  channel,
  contactName,
  contactEmail,
  contactPhone,
  onNameChange,
  onEmailChange,
  onPhoneChange,
  canSave,
  saving,
  onSave,
}: {
  score: ReturnType<typeof scoreLead> | null
  channel: ContactChannel
  contactName: string
  contactEmail: string
  contactPhone: string
  onNameChange(v: string): void
  onEmailChange(v: string): void
  onPhoneChange(v: string): void
  canSave: boolean
  saving: boolean
  onSave(): void
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            Potencial del contacto
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!score ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Empieza la conversación y verás aquí cómo se valora.
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="flex items-end justify-between">
                  <span className="text-3xl font-semibold tabular-nums">{score.score}</span>
                  <PotentialBadge label={score.label} />
                </div>
                <div className="mt-2">
                  <PotentialBar score={score.score} />
                </div>
              </div>

              <Separator />

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Por qué</p>
                {score.reasons.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Todavía no hay señales suficientes.
                  </p>
                ) : (
                  score.reasons.map((r) => (
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
                  ))
                )}
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-2 text-xs">
                <Metric label="Mensajes suyos" value={String(score.signals.contactMessages)} />
                <Metric
                  label={channel === 'telefono' ? 'Duración' : 'Tiempo'}
                  value={`${score.signals.conversationMinutes} min`}
                />
              </div>

              {score.signals.detectedIntents.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {score.signals.detectedIntents.map((i) => (
                    <Badge key={i} variant="outline" className="text-[10px]">
                      {i.replace(/_/g, ' ')}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Guardar en el CRM</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cName" className="text-xs">
              Nombre
            </Label>
            <Input
              id="cName"
              className="h-8"
              value={contactName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="María López"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cEmail" className="text-xs">
              Email
            </Label>
            <Input
              id="cEmail"
              type="email"
              className="h-8"
              value={contactEmail}
              onChange={(e) => onEmailChange(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cPhone" className="text-xs">
              Teléfono
            </Label>
            <Input
              id="cPhone"
              className="h-8"
              value={contactPhone}
              onChange={(e) => onPhoneChange(e.target.value)}
            />
          </div>

          <Button className="w-full" disabled={!canSave} loading={saving} onClick={onSave}>
            Guardar contacto
          </Button>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Si ya existe alguien con ese email o teléfono, se actualiza en vez de duplicarse.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-secondary/60 px-2.5 py-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium tabular-nums">{value}</p>
    </div>
  )
}
