/**
 * El camino común para "alguien escribió, que le responda un agente" —
 * usado tanto por el callback de n8n como por el webhook de Telegram. Antes
 * vivía solo dentro de n8n-callback; se extrae aquí para que ambos canales
 * compartan exactamente la misma lógica de deduplicación de contactos,
 * conversaciones y consulta de Conocimiento, en vez de mantener dos copias
 * que inevitablemente divergirían.
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { complete, isAnthropicConfigured } from './anthropic-client.ts'
import { scoreLead, type ScoredMessage } from './lead-scoring.ts'

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
    .select('id')
    .eq('business_id', businessId)
    .eq('lead_id', leadId)
    .eq('channel', input.channel)
    .neq('status', 'cerrada')
    .maybeSingle()

  let conversationId = existingConversation?.id as string | undefined

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

  if (input.incomingText) {
    await admin.from('messages').insert({
      conversation_id: conversationId,
      business_id: businessId,
      role: 'contacto',
      content: input.incomingText,
    })
  }

  const { data: history } = await admin
    .from('messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(20)

  // Se puntúa aquí, no solo en el simulador: cada mensaje real por Telegram o
  // n8n mueve la valoración del contacto igual que lo haría un mensaje de
  // prueba, con independencia de si hay un agente que además le responda.
  await scoreAndSaveLead(admin, businessId, leadId, history ?? [], input.channel)

  // Siempre exigiendo que el agente esté activo — si el que corresponde está
  // en pausa, no se sustituye por otro de un tipo distinto, que respondería
  // con la personalidad y el objetivo equivocados.
  let agentQuery = admin
    .from('ai_agents')
    .select('id, system_prompt')
    .eq('business_id', businessId)
    .eq('status', 'activo')

  if (input.agentType) agentQuery = agentQuery.eq('type', input.agentType)
  const { data: agent } = await agentQuery.limit(1).maybeSingle()

  if (!isAnthropicConfigured) {
    await admin.from('messages').insert({
      conversation_id: conversationId,
      business_id: businessId,
      role: 'sistema',
      content: 'Conecta un modelo de IA para que este agente responda automáticamente.',
    })
    return { conversationId, leadId, reply: null, reason: 'IA no configurada' }
  }

  if (!agent?.system_prompt) {
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

  const relevantKnowledge = await searchKnowledge(admin, businessId, input.incomingText)
  const system = relevantKnowledge
    ? `${agent.system_prompt}\n\n---\n\nINFORMACIÓN ADICIONAL DE TU NEGOCIO, relevante para este mensaje:\n\n${relevantKnowledge}`
    : agent.system_prompt

  const reply = await complete({ system, messages: claudeMessages, effort: 'low', maxTokens: 700 })

  await admin.from('messages').insert({
    conversation_id: conversationId,
    business_id: businessId,
    role: 'agente_ia',
    content: reply,
  })

  return { conversationId, leadId, reply, reason: null }
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
