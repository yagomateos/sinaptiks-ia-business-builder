/**
 * El camino común para "alguien escribió, que le responda un agente" —
 * usado tanto por el callback de n8n como por el webhook de Telegram. Antes
 * vivía solo dentro de n8n-callback; se extrae aquí para que ambos canales
 * compartan exactamente la misma lógica de deduplicación de contactos,
 * conversaciones y consulta de Conocimiento, en vez de mantener dos copias
 * que inevitablemente divergirían.
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import {
  completeWithTools,
  isAnthropicConfigured,
  type ClaudeMessage,
  type ClaudeToolUseBlock,
} from './anthropic-client.ts'
import { scoreLead, type ScoredMessage } from './lead-scoring.ts'
import { generateRuleBasedReply, type RulesReplyFaq } from './rules-reply.ts'
import { isConfigured as isN8nConfigured, n8n } from './n8n-client.ts'
import { webhookPathFor } from './workflow-builder.ts'
import { isResendConfigured, sendEmail } from './resend-client.ts'
import { appointmentRequestEmailHtml } from './email-templates.ts'

export interface ContactFields {
  name?: unknown
  nombre?: unknown
  email?: unknown
  phone?: unknown
  telefono?: unknown
  channel?: unknown
  canal?: unknown
}

export interface LeadResult {
  id: string
  created: boolean
}

/**
 * Busca un contacto por email o teléfono antes de crearlo. Una persona que
 * escribe por Telegram y luego por WhatsApp no debería generar dos fichas.
 */
export async function findOrCreateLead(
  admin: SupabaseClient,
  businessId: string,
  payload: ContactFields | undefined,
  defaultStage = 'nuevo',
): Promise<LeadResult> {
  const name = String(payload?.name ?? payload?.nombre ?? 'Contacto sin nombre')
  const email = payload?.email ? String(payload.email) : null
  const phoneRaw = payload?.phone ?? payload?.telefono
  const phone = phoneRaw ? String(phoneRaw) : null
  const channel = String(payload?.channel ?? payload?.canal ?? 'web')

  if (email || phone) {
    const { data: existing } = await admin
      .from('leads')
      .select('id')
      .eq('business_id', businessId)
      .or([email ? `email.eq.${email}` : '', phone ? `phone.eq.${phone}` : '']
        .filter(Boolean)
        .join(','))
      .maybeSingle()

    if (existing) return { id: existing.id, created: false }
  }

  const { data, error } = await admin
    .from('leads')
    .insert({
      business_id: businessId,
      full_name: name,
      email,
      phone,
      source: channel,
      stage: defaultStage,
      temperature: 'templado',
    })
    .select('id')
    .single()

  if (error) throw new Error(`No se pudo crear el contacto: ${error.message}`)
  return { id: data.id, created: true }
}

/**
 * Búsqueda por palabras clave sobre los documentos que el negocio ha subido y
 * procesado en "Conocimiento". Respaldo mientras no haya una base vectorial
 * real (Qdrant) — coincidencia de texto, no semántica, pero real: mejor esto
 * que un agente que nunca lea lo que el negocio le dio.
 */
export async function searchKnowledge(
  admin: SupabaseClient,
  businessId: string,
  query: string,
): Promise<string | null> {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 3)

  if (terms.length === 0) return null

  const { data } = await admin
    .from('knowledge_chunks')
    .select('content')
    .eq('business_id', businessId)
    .or(terms.map((t) => `content.ilike.%${t}%`).join(','))
    .limit(12)

  if (!data || data.length === 0) return null

  const ranked = data
    .map((row: { content: string }) => {
      const content = row.content.toLowerCase()
      const hits = terms.filter((t) => content.includes(t)).length
      return { content: row.content, score: hits / terms.length }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  return ranked.map((r) => r.content).join('\n\n')
}

/**
 * Puntúa al contacto con el mismo motor que usa el simulador y guarda el
 * resultado en su ficha. Se llama en cada mensaje real, no solo al guardar
 * manualmente desde el simulador — así una conversación de Telegram que se
 * enfría o se calienta se refleja sola en el CRM.
 */
async function scoreAndSaveLead(
  admin: SupabaseClient,
  businessId: string,
  leadId: string,
  history: { role: string; content: string; created_at: string }[],
  channel: string,
): Promise<void> {
  const messages: ScoredMessage[] = history
    .filter((m) => m.role === 'contacto' || m.role === 'agente_ia' || m.role === 'humano')
    .map((m) => ({
      role: m.role as ScoredMessage['role'],
      content: m.content,
      created_at: m.created_at,
    }))

  if (messages.every((m) => m.role !== 'contacto')) return

  const score = scoreLead({ messages, channel })

  const { data: before } = await admin
    .from('leads')
    .select('full_name, potential_label')
    .eq('id', leadId)
    .maybeSingle()

  await admin
    .from('leads')
    .update({
      potential_score: score.score,
      potential_label: score.label,
      temperature: score.temperature,
      scored_at: new Date().toISOString(),
      score_signals: { reasons: score.reasons, ...score.signals },
      last_contacted_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  // Solo al entrar en caliente, no en cada mensaje que le siga: si no, una
  // conversación larga con alguien ya identificado como buen contacto
  // inundaría de avisos repetidos por algo que el negocio ya sabe.
  const wasHot = before?.potential_label === 'caliente' || before?.potential_label === 'muy_caliente'
  const isHot = score.label === 'caliente' || score.label === 'muy_caliente'

  if (isHot && !wasHot) {
    await admin.from('notifications').insert({
      business_id: businessId,
      level: 'exito',
      title: `${before?.full_name ?? 'Un contacto'} tiene buena pinta (${score.score}/100)`,
      body: score.reasons[0]?.label ?? null,
      entity_type: 'lead',
      entity_id: leadId,
    })
  }
}

interface IncomingMessageAutomation {
  id: string
  n8n_workflow_id: string | null
  trigger: { type: string; config?: { channels?: string; intent?: string } }
  actions: { type: string }[]
}

/**
 * Automatizaciones activas de tipo "mensaje_entrante" para este negocio.
 * Se consulta una sola vez por mensaje real y se reutiliza tanto para las
 * que disparan en cuanto llega el mensaje como para las que dependen de
 * `intent: 'escalado'`, que solo se sabe más abajo en `respondWithAgent`.
 */
async function fetchIncomingMessageAutomations(
  admin: SupabaseClient,
  businessId: string,
): Promise<IncomingMessageAutomation[]> {
  if (!isN8nConfigured) return []

  const { data } = await admin
    .from('automations')
    .select('id, n8n_workflow_id, trigger, actions')
    .eq('business_id', businessId)
    .eq('status', 'activa')
    .eq('trigger->>type', 'mensaje_entrante')
    .not('n8n_workflow_id', 'is', null)

  return (data ?? []) as IncomingMessageAutomation[]
}

/**
 * Dispara una automatización por su webhook de n8n. Es best-effort a
 * propósito: una automatización de más (o de menos) no puede tirar abajo la
 * respuesta real al contacto, que es lo único que le importa a quien escribió.
 */
async function fireAutomation(
  automation: IncomingMessageAutomation,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await n8n.trigger(webhookPathFor({ id: automation.id }), payload)
  } catch (error) {
    console.error(`No se pudo disparar la automatización ${automation.id} (mensaje_entrante)`, error)
  }
}

/**
 * Las automatizaciones "mensaje_entrante" sin `intent` (o solo con filtro de
 * canal) son seguras de disparar en cuanto llega el mensaje: no dependen de
 * saber cómo va a responder el agente. Las que sí tienen `intent` configurado
 * ("reserva", "faq") necesitarían clasificar la intención del mensaje —
 * todavía no implementado — así que se dejan fuera aquí a propósito; el
 * intent "escalado" es la excepción, porque `detectHandoff` ya calcula
 * exactamente esa señal más abajo, y se dispara desde ahí.
 *
 * Dos exclusiones más, para no introducir un bug al conectar esto:
 * - Un paso `responder_ia` duplicaría la respuesta que este mismo pipeline ya
 *   genera de forma directa para cada mensaje — el segundo mensaje del
 *   agente quedaría huérfano en la conversación (nadie lo reenvía al canal
 *   real) y además dobla el gasto de Claude por el mismo mensaje.
 * - Sin exigir que sea el primer mensaje de la conversación, una automatización
 *   como "avisa al equipo cuando alguien contacta" avisaría en cada mensaje
 *   de una conversación larga, no solo cuando de verdad es un contacto nuevo.
 */
async function fireImmediateIncomingMessageAutomations(
  automations: IncomingMessageAutomation[],
  channel: string,
  isNewConversation: boolean,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!isNewConversation) return

  const candidates = automations.filter(
    (a) => !a.trigger.config?.intent && !a.actions.some((action) => action.type === 'responder_ia'),
  )

  await Promise.all(
    candidates
      .filter((a) => {
        const configuredChannel = a.trigger.config?.channels
        return !configuredChannel || configuredChannel === 'all' || configuredChannel === channel
      })
      .map((a) => fireAutomation(a, payload)),
  )
}

/**
 * Antes de esto, el prompt le decía al agente "avisa al equipo" pero nada
 * conectaba esa frase con un aviso real — el cliente se iba creyendo que
 * alguien se iba a enterar, y nadie lo hacía. Con esta herramienta, cuando
 * Claude reúne servicio + fecha/hora + contacto, dispara una notificación de
 * verdad en el panel en vez de solo prometerlo en el texto.
 */
const REGISTER_APPOINTMENT_TOOL = {
  name: 'registrar_solicitud_cita',
  description:
    'Registra una solicitud de cita para que el equipo del negocio la vea y la confirme. ' +
    'Llama a esto UNA SOLA VEZ, justo cuando ya tengas el servicio que quiere el cliente, ' +
    'cuándo le viene bien, y una forma de contacto (teléfono o email). No la llames si todavía ' +
    'falta alguno de esos tres datos — sigue preguntando hasta tenerlos.',
  input_schema: {
    type: 'object',
    properties: {
      nombre: { type: 'string', description: 'Nombre del cliente, si lo dio' },
      servicio: { type: 'string', description: 'Servicio o tratamiento que pide' },
      fecha_hora_preferida: { type: 'string', description: 'Cuándo le viene bien, tal cual lo dijo' },
      telefono: { type: 'string' },
      email: { type: 'string' },
    },
    required: ['servicio', 'fecha_hora_preferida'],
  },
} as const

async function registerAppointmentRequest(
  admin: SupabaseClient,
  businessId: string,
  leadId: string,
  conversationId: string,
  args: Record<string, unknown>,
  payload: ContactFields,
): Promise<string> {
  const servicio = String(args.servicio ?? 'un servicio sin especificar')
  const fechaHora = String(args.fecha_hora_preferida ?? 'sin fecha concretada')
  const nombre = String(args.nombre ?? payload.name ?? payload.nombre ?? 'Un contacto')
  const telefono = args.telefono ? String(args.telefono) : null
  const email = args.email ? String(args.email) : null
  const contacto = [telefono, email].filter(Boolean).join(' · ') || 'sin contacto adicional'

  await admin.from('notifications').insert({
    business_id: businessId,
    level: 'aviso',
    title: `${nombre} quiere una cita`,
    body: `${servicio} — ${fechaHora}. Contacto: ${contacto}`,
    entity_type: 'conversation',
    entity_id: conversationId,
  })

  // El teléfono real del cliente NO va al campo `phone` del lead: para un
  // contacto de Telegram ese campo guarda `tg:<chat_id>` y es la clave con la
  // que se le reconoce en el siguiente mensaje — sobrescribirlo rompería esa
  // deduplicación. Se guarda en `notes` en su lugar.
  const { data: currentLead } = await admin
    .from('leads')
    .select('notes')
    .eq('id', leadId)
    .maybeSingle()

  const noteLine = `Pidió cita: ${servicio} — ${fechaHora}${telefono ? ` (tel: ${telefono})` : ''}`
  const notes = [currentLead?.notes, noteLine].filter(Boolean).join('\n')

  await admin
    .from('leads')
    .update({
      ...(email ? { email } : {}),
      notes,
      next_action: `Confirmar cita: ${servicio} — ${fechaHora}`,
      stage: 'cita',
      temperature: 'caliente',
    })
    .eq('id', leadId)

  await sendAppointmentEmail(admin, businessId, {
    nombre,
    servicio,
    fechaHora,
    telefono,
    email,
    canal: String(payload.channel ?? payload.canal ?? 'web'),
  })

  return 'Solicitud registrada, el equipo ya lo tiene.'
}

/**
 * Best-effort a propósito, igual que fireAutomation: un email que no sale no
 * puede tirar abajo la respuesta al cliente ni deshacer lo que ya se guardó
 * en el aviso del panel y en el lead.
 */
async function sendAppointmentEmail(
  admin: SupabaseClient,
  businessId: string,
  details: {
    nombre: string
    servicio: string
    fechaHora: string
    telefono: string | null
    email: string | null
    canal: string
  },
): Promise<void> {
  if (!isResendConfigured) return

  try {
    const { data: profile } = await admin
      .from('business_profiles')
      .select('business_name, notification_email')
      .eq('business_id', businessId)
      .maybeSingle()

    let to = profile?.notification_email ?? null

    if (!to) {
      const { data: business } = await admin
        .from('businesses')
        .select('profiles(email)')
        .eq('id', businessId)
        .maybeSingle()
      to = (business?.profiles as { email?: string } | null)?.email ?? null
    }

    if (!to) return

    await sendEmail({
      to,
      subject: `Nueva solicitud de cita — ${details.nombre}`,
      html: appointmentRequestEmailHtml({
        businessName: profile?.business_name ?? 'tu negocio',
        ...details,
      }),
    })
  } catch (error) {
    console.error('No se pudo enviar el email de la solicitud de cita', error)
  }
}

export interface AgentReplyResult {
  conversationId: string
  leadId: string
  /** Null cuando no hubo respuesta — sin modelo configurado o sin agente activo. */
  reply: string | null
  /** Por qué no hubo respuesta, cuando `reply` es null. */
  reason: string | null
}

/**
 * Registra la conversación real de un contacto y, si hay modelo y agente
 * activo, genera la respuesta. Sin uno de los dos, la conversación se crea
 * igual — para que el negocio vea que alguien escribió — pero sin fingir una
 * respuesta que nadie generó.
 */
export async function respondWithAgent(
  admin: SupabaseClient,
  businessId: string,
  input: {
    payload: ContactFields
    incomingText: string
    channel: string
    /** Tipo de agente a usar; si no se indica, el primero activo. */
    agentType?: string | null
  },
): Promise<AgentReplyResult> {
  const { id: leadId } = await findOrCreateLead(admin, businessId, input.payload)

  const { data: existingConversation } = await admin
    .from('conversations')
    .select('id, handled_by, handled_by_since')
    .eq('business_id', businessId)
    .eq('lead_id', leadId)
    .eq('channel', input.channel)
    .neq('status', 'cerrada')
    .maybeSingle()

  let conversationId = existingConversation?.id as string | undefined
  const handedOffAlready = existingConversation?.handled_by === 'humano'
  const handledSince = existingConversation?.handled_by_since ?? null
  const isNewConversation = !conversationId

  if (!conversationId) {
    const { data: created, error } = await admin
      .from('conversations')
      .insert({
        business_id: businessId,
        lead_id: leadId,
        channel: input.channel,
        handled_by: 'agente_ia',
      })
      .select('id')
      .single()

    if (error) throw new Error(`No se pudo crear la conversación: ${error.message}`)
    conversationId = created.id
  }

  const incomingMessageAutomations = input.incomingText
    ? await fetchIncomingMessageAutomations(admin, businessId)
    : []

  if (input.incomingText) {
    await admin.from('messages').insert({
      conversation_id: conversationId,
      business_id: businessId,
      role: 'contacto',
      content: input.incomingText,
    })

    await fireImmediateIncomingMessageAutomations(
      incomingMessageAutomations,
      input.channel,
      isNewConversation,
      {
        ...input.payload,
        businessId,
        leadId,
        conversationId,
        channel: input.channel,
        message: input.incomingText,
        source: 'evento_real',
        triggeredAt: new Date().toISOString(),
      },
    )
  }

  // Ascendente + limit(20) coge los 20 mensajes MÁS ANTIGUOS de la
  // conversación, no los más recientes — con más de 20 mensajes en total, el
  // agente veía la charla de hace horas y, sin nada en medio, el mensaje de
  // ahora mismo. Se pide en descendente (los últimos 20 de verdad) y se
  // invierte para devolver el orden cronológico que espera el resto de la
  // función.
  const { data: recentHistory } = await admin
    .from('messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(20)

  const history = recentHistory ? [...recentHistory].reverse() : recentHistory

  // Se puntúa aquí, no solo en el simulador: cada mensaje real por Telegram o
  // n8n mueve la valoración del contacto igual que lo haría un mensaje de
  // prueba, con independencia de si hay un agente que además le responda.
  await scoreAndSaveLead(admin, businessId, leadId, history ?? [], input.channel)

  // "Pasar a humano" (manual o por las reglas de derivación) promete que el
  // agente deja de responder. Sin este corte, el siguiente mensaje del
  // contacto volvería a generar una respuesta de IA por encima de la persona
  // que ya se hizo cargo.
  if (handedOffAlready) {
    return { conversationId, leadId, reply: null, reason: 'Conversación a cargo de una persona' }
  }

  // Siempre exigiendo que el agente esté activo — si el que corresponde está
  // en pausa, no se sustituye por otro de un tipo distinto, que respondería
  // con la personalidad y el objetivo equivocados.
  let agentQuery = admin
    .from('ai_agents')
    .select('id, system_prompt, handoff_rules')
    .eq('business_id', businessId)
    .eq('status', 'activo')

  if (input.agentType) agentQuery = agentQuery.eq('type', input.agentType)
  const { data: agent } = await agentQuery.limit(1).maybeSingle()

  if (!agent) {
    return { conversationId, leadId, reply: null, reason: 'Sin agente activo que responda' }
  }

  const claudeMessages = (history ?? [])
    .filter((m: { role: string }) => m.role !== 'sistema')
    .map((m: { role: string; content: string }) => ({
      role: (m.role === 'contacto' ? 'user' : 'assistant') as const,
      content: m.content,
    }))

  if (claudeMessages.length === 0 || claudeMessages[claudeMessages.length - 1].role !== 'user') {
    claudeMessages.push({ role: 'user', content: input.incomingText || 'Hola' })
  }

  let reply: string | null = null
  let repliedWithAi = false

  // isAnthropicConfigured solo dice que hay una clave puesta, no que funcione
  // — puede estar sin saldo, caducada, o Anthropic puede estar caído. Se
  // intenta primero, pero un fallo aquí no debe dejar al negocio mudo con su
  // cliente: cae al motor de reglas, exactamente como ya hace el proveedor
  // remoto del frontend (ver src/services/ai/providers/remote.provider.ts).
  if (isAnthropicConfigured && agent.system_prompt) {
    try {
      const relevantKnowledge = await searchKnowledge(admin, businessId, input.incomingText)
      // El prompt del negocio suele traer ya su propio guion de despedida
      // ("el equipo te escribirá") — sin este empujón, el modelo se queda
      // satisfecho con decirlo en texto y nunca llega a llamar a la
      // herramienta, que es lo único que avisa de verdad. La descripción de
      // la herramienta sola no basta para competir con un guion completo ya
      // escrito en el prompt.
      const system = `${agent.system_prompt}${
        relevantKnowledge
          ? `\n\n---\n\nINFORMACIÓN ADICIONAL DE TU NEGOCIO, relevante para este mensaje:\n\n${relevantKnowledge}`
          : ''
      }\n\n---\n\nEn cuanto tengas el servicio, la fecha/hora preferida y un teléfono o email de contacto, llama a la herramienta registrar_solicitud_cita antes de despedirte — decirlo en el texto no avisa a nadie de verdad, solo la llamada a la herramienta lo hace.`

      const tools = [REGISTER_APPOINTMENT_TOOL]
      const first = await completeWithTools({
        system,
        messages: claudeMessages,
        effort: 'low',
        maxTokens: 700,
        tools,
      })

      const toolUse = first.content.find(
        (b): b is ClaudeToolUseBlock => b.type === 'tool_use',
      )

      if (toolUse && first.stop_reason === 'tool_use') {
        const toolResultText = await registerAppointmentRequest(
          admin,
          businessId,
          leadId,
          conversationId,
          toolUse.input,
          input.payload,
        )

        // Segundo turno solo para que Claude cierre la frase al cliente
        // sabiendo que el registro salió bien — el propio tool_result se lo
        // dice, no hace falta que vuelva a decidir si llamar a la
        // herramienta otra vez.
        const followUp: ClaudeMessage[] = [
          ...claudeMessages,
          { role: 'assistant', content: first.content },
          {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: toolResultText }],
          },
        ]

        const second = await completeWithTools({
          system,
          messages: followUp,
          effort: 'low',
          maxTokens: 300,
          tools,
        })

        const textBlock = second.content.find(
          (b): b is { type: 'text'; text: string } => b.type === 'text',
        )
        reply = textBlock?.text?.trim() || 'Perfecto, queda registrado — el equipo te confirma en breve.'
      } else {
        const textBlock = first.content.find(
          (b): b is { type: 'text'; text: string } => b.type === 'text',
        )
        const text = textBlock?.text?.trim()
        if (!text) throw new Error('El modelo de IA ha devuelto una respuesta vacía')
        reply = text
      }

      repliedWithAi = true
    } catch (error) {
      console.error('Claude falló, se cae al motor de reglas', error)
    }
  }

  if (reply === null) {
    const [{ data: profile }, { data: services }] = await Promise.all([
      admin.from('business_profiles').select('business_name, faq').eq('business_id', businessId).maybeSingle(),
      admin
        .from('services')
        .select('name, description, price, currency, duration_minutes, is_active')
        .eq('business_id', businessId),
    ])

    const lastAgentMessage = [...claudeMessages].reverse().find((m) => m.role === 'assistant')?.content

    reply = generateRuleBasedReply({
      incomingText: input.incomingText,
      businessName: profile?.business_name ?? 'nuestro negocio',
      faq: (profile?.faq as RulesReplyFaq[] | null) ?? [],
      services: services ?? [],
      escalationMessage:
        (agent.handoff_rules as { escalation_message?: string } | null)?.escalation_message ??
        'Te contactaremos en breve.',
      lastAgentMessage,
    })
  }

  await admin.from('messages').insert({
    conversation_id: conversationId,
    business_id: businessId,
    role: 'agente_ia',
    content: reply,
    metadata: repliedWithAi ? {} : { source: 'reglas' },
  })

  // El agente promete en su propio prompt "te escribirán en breve" cuando
  // deriva — pero decirlo no avisa a nadie. Sin esto, la promesa la hace el
  // texto y el cumplimiento no lo hace nadie. (handedOffAlready ya cortó la
  // ejecución más arriba si la conversación era humana de antes, así que
  // llegar aquí implica que todavía no lo era.)
  // Contar desde el historial completo de la conversación haría que una que
  // superó el umbral una vez no pudiera bajar nunca de él: reasignarla a IA
  // (`handled_by_since` se actualiza al hacerlo) debe darle turnos frescos,
  // no heredar los que ya se contaron la vez anterior.
  const contactTurns = (history ?? []).filter(
    (m: { role: string; created_at: string }) =>
      m.role === 'contacto' && (!handledSince || m.created_at >= handledSince),
  ).length
  const shouldHandOff = detectHandoff(agent.handoff_rules, {
    incomingText: input.incomingText,
    reply,
    contactTurns,
  })

  if (shouldHandOff) {
    await Promise.all(
      incomingMessageAutomations
        .filter((a) => a.trigger.config?.intent === 'escalado')
        .map((a) =>
          fireAutomation(a, {
            ...input.payload,
            businessId,
            leadId,
            conversationId,
            channel: input.channel,
            message: input.incomingText,
            reason: shouldHandOff,
            source: 'evento_real',
            triggeredAt: new Date().toISOString(),
          }),
        ),
    )

    await admin
      .from('conversations')
      .update({ handled_by: 'humano', status: 'pendiente' })
      .eq('id', conversationId)

    const { data: lead } = await admin
      .from('leads')
      .select('full_name')
      .eq('id', leadId)
      .maybeSingle()

    await admin.from('notifications').insert({
      business_id: businessId,
      level: 'aviso',
      title: `${lead?.full_name ?? 'Un contacto'} necesita hablar con una persona`,
      body: shouldHandOff,
      entity_type: 'conversation',
      entity_id: conversationId,
    })
  }

  return { conversationId, leadId, reply, reason: null }
}

interface HandoffRules {
  escalate_on_keywords?: string[]
  escalate_after_turns?: number
  escalation_message?: string
}

/** Devuelve el motivo (para el aviso) si toca derivar, o null si no. */
function detectHandoff(
  rules: HandoffRules | null | undefined,
  ctx: { incomingText: string; reply: string; contactTurns: number },
): string | null {
  if (!rules) return null

  const text = ctx.incomingText.toLowerCase()
  const matchedKeyword = (rules.escalate_on_keywords ?? []).find((k) =>
    text.includes(k.toLowerCase()),
  )
  if (matchedKeyword) return `Mencionó "${matchedKeyword}"`

  if (rules.escalate_after_turns && ctx.contactTurns >= rules.escalate_after_turns) {
    return `Lleva ${ctx.contactTurns} mensajes sin resolverse`
  }

  // La señal más fiable: el propio agente decidió derivar y lo dijo con las
  // palabras exactas que se le configuraron.
  const escalationMessage = rules.escalation_message?.trim()
  if (escalationMessage && ctx.reply.includes(escalationMessage)) {
    return 'El agente decidió derivarlo'
  }

  return null
}

/**
 * Localiza (sin crear) la conversación abierta del contacto identificado por
 * `payload`. La usa n8n-callback para enlazar el historial de una
 * automatización a la conversación que produjo un paso anterior.
 */
export async function findConversationId(
  admin: SupabaseClient,
  businessId: string,
  payload: ContactFields | undefined,
): Promise<string | null> {
  const email = payload?.email ? String(payload.email) : null
  const phoneRaw = payload?.phone ?? payload?.telefono
  const phone = phoneRaw ? String(phoneRaw) : null
  const channel = String(payload?.channel ?? payload?.canal ?? 'web')

  if (!email && !phone) return null

  const { data: lead } = await admin
    .from('leads')
    .select('id')
    .eq('business_id', businessId)
    .or([email ? `email.eq.${email}` : '', phone ? `phone.eq.${phone}` : '']
      .filter(Boolean)
      .join(','))
    .maybeSingle()

  if (!lead) return null

  const { data: conversation } = await admin
    .from('conversations')
    .select('id')
    .eq('business_id', businessId)
    .eq('lead_id', lead.id)
    .eq('channel', channel)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  return conversation?.id ?? null
}
