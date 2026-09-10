import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, MessageSquare, Send, User, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, Separator, Tabs, TabsList, TabsTrigger } from '@/components/ui/misc'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/shared/states'
import {
  conversationsRepository,
  type ConversationWithLead,
} from '@/services/repositories/conversations.repository'
import { CHANNEL_LABELS, LEAD_STAGE_LABELS } from '@/domain/vocabulary'
import type { ContactChannel, ConversationStatus, Message } from '@/domain/types'
import { useBusiness } from '@/features/businesses/business-context'
import { TemperatureDot } from '@/features/dashboard/dashboard-page'
import { cn, formatDateTime, formatRelative, initials } from '@/lib/utils'

type Filter = ConversationStatus | 'todas'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'abierta', label: 'Abiertas' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'cerrada', label: 'Cerradas' },
]

export function ConversationsPage() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''

  const [filter, setFilter] = useState<Filter>('todas')

  const query = useQuery({
    queryKey: ['conversations', businessId, filter],
    queryFn: () => conversationsRepository.list(businessId, filter),
    enabled: Boolean(businessId),
  })

  const conversations = query.data ?? []
  const foundInList = conversations.find((c) => c.id === conversationId)

  // Un enlace directo (p. ej. desde la campana de avisos) puede apuntar a una
  // conversación que no está en la pestaña de filtro activa en este momento
  // — "Pendientes" no la tendría si la lista se cargó en "Abiertas". Sin este
  // resguardo, el enlace aterrizaría en "elige una conversación" en silencio.
  const fallbackQuery = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => conversationsRepository.getById(conversationId!),
    enabled: Boolean(conversationId) && !foundInList && !query.isLoading,
  })

  const selected = foundInList ?? fallbackQuery.data ?? null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conversaciones"
        description="Todos los mensajes de tus clientes, vengan del canal que vengan."
      />

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          {FILTERS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {query.isLoading ? (
        <ListSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : conversations.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="Todavía no hay conversaciones"
          description="En cuanto conectes un canal y alguien te escriba, la conversación aparecerá aquí."
          action={{ label: 'Conectar un canal', onClick: () => navigate('/app/canales') }}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <Card className="h-fit divide-y overflow-hidden lg:max-h-[calc(100vh-260px)] lg:overflow-y-auto">
            {conversations.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                selected={conversation.id === conversationId}
              />
            ))}
          </Card>

          {selected ? (
            <ConversationView conversation={selected} businessId={businessId} />
          ) : (
            <Card className="hidden items-center justify-center p-10 lg:flex">
              <p className="text-sm text-muted-foreground">
                Elige una conversación para verla.
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

function ConversationRow({
  conversation,
  selected,
}: {
  conversation: ConversationWithLead
  selected: boolean
}) {
  const name = conversation.lead?.full_name ?? 'Contacto sin nombre'

  return (
    <Link
      to={`/app/conversaciones/${conversation.id}`}
      className={cn(
        'flex gap-3 p-4 transition-colors hover:bg-secondary/60',
        selected && 'bg-accent/60',
      )}
    >
      <Avatar className="h-8 w-8">
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium">{name}</p>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {formatRelative(conversation.last_message_at ?? conversation.created_at)}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {CHANNEL_LABELS[conversation.channel as ContactChannel] ?? conversation.channel}
          {conversation.subject ? ` · ${conversation.subject}` : ''}
        </p>
        <div className="mt-1.5 flex items-center gap-1.5">
          {conversation.handled_by === 'humano' ? (
            <Badge variant="warning" className="gap-1">
              <UserCheck />
              Humano
            </Badge>
          ) : (
            <Badge variant="default" className="gap-1">
              <Bot />
              Agente IA
            </Badge>
          )}
          {conversation.unread_count > 0 && (
            <Badge variant="destructive">{conversation.unread_count}</Badge>
          )}
        </div>
      </div>
    </Link>
  )
}

function ConversationView({
  conversation,
  businessId,
}: {
  conversation: ConversationWithLead
  businessId: string
}) {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const messagesQuery = useQuery({
    queryKey: ['messages', conversation.id],
    queryFn: () => conversationsRepository.listMessages(conversation.id),
  })

  const messages = messagesQuery.data ?? []

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  useEffect(() => {
    if (conversation.unread_count > 0) {
      conversationsRepository.markRead(conversation.id).then(() => {
        queryClient.invalidateQueries({ queryKey: ['conversations', businessId] })
      })
    }
  }, [conversation.id, conversation.unread_count, businessId, queryClient])

  const send = useMutation({
    mutationFn: () =>
      conversationsRepository.sendMessage({
        conversationId: conversation.id,
        businessId,
        role: 'humano',
        content: text.trim(),
      }),
    onSuccess: () => {
      setText('')
      queryClient.invalidateQueries({ queryKey: ['messages', conversation.id] })
      queryClient.invalidateQueries({ queryKey: ['conversations', businessId] })
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No hemos podido enviar el mensaje.'),
  })

  const handOff = useMutation({
    mutationFn: () => conversationsRepository.handOffToHuman(conversation.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', businessId] })
      toast.success('La conversación es tuya. El agente ya no responderá.')
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No hemos podido cambiarla.'),
  })

  const reassign = useMutation({
    mutationFn: () => conversationsRepository.reassignToAgent(conversation.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', businessId] })
      toast.success('El agente vuelve a responder en esta conversación.')
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No hemos podido cambiarla.'),
  })

  const lead = conversation.lead
  const name = lead?.full_name ?? 'Contacto sin nombre'

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_260px]">
      <Card className="flex h-[560px] flex-col">
        <div className="flex items-center justify-between gap-3 border-b p-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{initials(name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {CHANNEL_LABELS[conversation.channel as ContactChannel] ?? conversation.channel}
              </p>
            </div>
          </div>

          {conversation.handled_by === 'agente_ia' ? (
            <Button
              size="sm"
              variant="outline"
              loading={handOff.isPending}
              onClick={() => handOff.mutate()}
            >
              <UserCheck />
              Pasar a humano
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              loading={reassign.isPending}
              onClick={() => reassign.mutate()}
            >
              <Bot />
              Reasignar a IA
            </Button>
          )}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messagesQuery.isLoading ? (
            <ListSkeleton count={3} />
          ) : messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Todavía no hay mensajes en esta conversación.
            </p>
          ) : (
            messages.map((message) => <MessageBubble key={message.id} message={message} />)
          )}
          <div ref={bottomRef} />
        </div>

        <form
          className="flex gap-2 border-t p-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (text.trim()) send.mutate()
          }}
        >
          <Textarea
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe tu respuesta…"
            className="min-h-[38px] resize-none"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                if (text.trim()) send.mutate()
              }
            }}
          />
          <Button type="submit" size="icon" loading={send.isPending} disabled={!text.trim()}>
            <Send />
          </Button>
        </form>
      </Card>

      <Card className="h-fit p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Contacto
        </p>

        {lead ? (
          <div className="mt-3 space-y-3">
            <div>
              <Link
                to={`/app/clientes/${lead.id}`}
                className="text-sm font-medium hover:text-primary"
              >
                {lead.full_name}
              </Link>
              <p className="text-xs text-muted-foreground">
                {lead.email ?? lead.phone ?? 'Sin datos de contacto'}
              </p>
            </div>

            <Separator />

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Estado</span>
              <Badge variant="secondary">{LEAD_STAGE_LABELS[lead.stage]}</Badge>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Interés</span>
              <TemperatureDot temperature={lead.temperature} />
            </div>

            {lead.next_action && (
              <>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground">Próxima acción</p>
                  <p className="mt-1 text-sm">{lead.next_action}</p>
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Esta conversación todavía no está asociada a ningún contacto.
          </p>
        )}
      </Card>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isContact = message.role === 'contacto'
  const isSystem = message.role === 'sistema'

  if (isSystem) {
    return (
      <p className="text-center text-xs text-muted-foreground">{message.content}</p>
    )
  }

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
        ) : message.role === 'agente_ia' ? (
          <Bot className="h-3.5 w-3.5 text-primary" />
        ) : (
          <UserCheck className="h-3.5 w-3.5 text-primary" />
        )}
      </div>

      <div className={cn('max-w-[75%]', !isContact && 'text-right')}>
        <div
          className={cn(
            'rounded-lg px-3.5 py-2.5 text-sm leading-relaxed',
            isContact ? 'bg-secondary' : 'bg-primary text-primary-foreground',
          )}
        >
          <p className="whitespace-pre-wrap text-left">{message.content}</p>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {formatDateTime(message.created_at)}
        </p>
      </div>
    </div>
  )
}
