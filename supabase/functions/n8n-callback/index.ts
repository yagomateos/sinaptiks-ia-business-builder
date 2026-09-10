/**
 * Edge Function `n8n-callback` — el camino de vuelta.
 *
 * Cada nodo de acción de un workflow llama aquí. Esta función registra la
 * ejecución y realiza el efecto real sobre la base de datos.
 *
 * Se autentica con un secreto compartido, no con sesión de usuario: quien
 * llama es n8n, no una persona. Por eso usa la service role key y por eso
 * comprueba el secreto antes de tocar nada.
 *
 * Cuando se conecten WhatsApp o el calendario, las acciones que hoy solo
 * registran pasarán a enviar de verdad: el contrato con n8n no cambia.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { complete, isAnthropicConfigured } from '../_shared/anthropic-client.ts'

const CALLBACK_SECRET = Deno.env.get('N8N_CALLBACK_SECRET') ?? ''

// Service role: n8n no actúa como ningún usuario, así que RLS no aplica.
// Todo lo que se escribe va explícitamente acotado por business_id.
const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

interface CallbackBody {
  automationId: string
  businessId: string
  actionType: string
  actionConfig: Record<string, unknown>
  stepIndex: number
  isLastStep: boolean
  payload: Record<string, unknown>
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Método no permitido', { status: 405 })
  }

  if (!CALLBACK_SECRET || request.headers.get('x-sinaptkis-secret') !== CALLBACK_SECRET) {
    console.warn('Callback rechazado: secreto incorrecto')
    return new Response('No autorizado', { status: 401 })
  }

  const startedAt = new Date().toISOString()
  let body: CallbackBody

  try {
    body = await request.json()
  } catch {
    return new Response('Cuerpo no válido', { status: 400 })
  }

  const { automationId, businessId, actionType } = body
  if (!automationId || !businessId) {
    return new Response('Faltan datos', { status: 400 })
  }

  // La automatización tiene que existir y pertenecer a ese negocio. Sin esta
  // comprobación, un secreto filtrado permitiría escribir en cualquier negocio.
  const { data: automation } = await admin
    .from('automations')
    .select('id, name, business_id')
    .eq('id', automationId)
    .eq('business_id', businessId)
    .maybeSingle()

  if (!automation) {
    console.warn(`Callback para automatización inexistente: ${automationId}`)
    return new Response('No encontrada', { status: 404 })
  }

  try {
    const detail = await performAction(body, automation.name)

    // Solo se registra una ejecución por disparo, no una por paso. La
    // conversación puede haberla creado un paso anterior (cada paso es una
    // llamada HTTP separada, sin memoria compartida), así que se localiza de
    // forma independiente aquí a partir de los mismos datos de contacto —
    // idéntico a como cualquier paso encontraría al mismo contacto — para
    // poder enlazarla desde el historial sin tener que ir a buscarla.
    if (body.isLastStep) {
      const conversationId = await findConversationId(businessId, body.payload)

      await admin.from('automation_executions').insert({
        automation_id: automationId,
        business_id: businessId,
        status: 'exito',
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - new Date(startedAt).getTime(),
        payload: {
          actionType,
          detail,
          source: body.payload?.source ?? 'n8n',
          ...(conversationId ? { conversationId } : {}),
        },
      })
    }

    return Response.json({ ok: true, detail })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    console.error(`Acción ${actionType} falló`, error)

    await admin.from('automation_executions').insert({
      automation_id: automationId,
      business_id: businessId,
      status: 'error',
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      error_message: message,
      payload: { actionType },
    })

    return Response.json({ ok: false, error: message }, { status: 500 })
  }
})

/* ------------------------------------------------------------------ */

/**
 * Ejecuta el efecto de una acción.
 *
 * Las que todavía dependen de un canal externo sin conectar (WhatsApp, email,
 * calendario) no envían nada: dejan constancia en la actividad del negocio
 * para que el usuario vea que el flujo llegó hasta ahí. Es preferible que no
 * pase nada a fingir que se envió un mensaje que nadie recibió — el mismo
 * principio que sigue `responder_ia` cuando no hay un modelo configurado.
 */
async function performAction(body: CallbackBody, automationName: string): Promise<string> {
  const { businessId, actionType, actionConfig, payload } = body

  switch (actionType) {
    case 'crear_lead': {
      const { id, created } = await findOrCreateLead(businessId, payload, actionConfig)
      return created ? `Contacto creado (${id})` : `El contacto ya existía (${id})`
    }

    case 'responder_ia':
      return await respondWithAgent(businessId, actionConfig, payload)

    case 'actualizar_lead': {
      // Si el paso trae un id explícito se usa tal cual; si no, se localiza
      // por email o teléfono — el mismo contacto que un paso anterior de la
      // misma automatización puede haber creado.
      const explicitId = payload?.leadId ?? payload?.lead_id
      const leadId = explicitId
        ? String(explicitId)
        : (await findOrCreateLead(businessId, payload, actionConfig)).id

      if (!leadId) return 'Sin contacto que actualizar'

      const patch: Record<string, unknown> = { last_contacted_at: new Date().toISOString() }
      if (actionConfig.stage) patch.stage = actionConfig.stage
      if (actionConfig.temperature) patch.temperature = actionConfig.temperature

      const { error } = await admin
        .from('leads')
        .update(patch)
        .eq('id', leadId)
        .eq('business_id', businessId)

      if (error) throw new Error(`No se pudo actualizar el contacto: ${error.message}`)
      return 'Contacto actualizado'
    }

    case 'notificar_equipo': {
      const { error } = await admin.from('notifications').insert({
        business_id: businessId,
        level: String(actionConfig.level ?? 'info'),
        title: automationName,
        body: describePayload(payload),
      })

      if (error) throw new Error(`No se pudo crear el aviso: ${error.message}`)
      return 'Aviso creado'
    }

    default: {
      // enviar_whatsapp, enviar_email, agendar_cita, solicitar_resena:
      // pendientes de conectar su canal.
      await admin.from('activity_logs').insert({
        business_id: businessId,
        actor_label: 'Automatización',
        action: `${automationName}: ${describeAction(actionType)}`,
        entity_type: 'automation',
        entity_id: body.automationId,
        metadata: { actionType, pendiente_de_canal: true },
      })

      return `Paso registrado (${actionType} requiere conectar su canal)`
    }
  }
}

const ACTION_DESCRIPTIONS: Record<string, string> = {
  enviar_telegram: 'mensaje de Telegram pendiente de enviar',
  enviar_whatsapp: 'mensaje de WhatsApp pendiente de enviar',
  enviar_email: 'email pendiente de enviar',
  agendar_cita: 'cita pendiente de agendar',
  solicitar_resena: 'solicitud de reseña pendiente',
}

function describeAction(actionType: string): string {
  return ACTION_DESCRIPTIONS[actionType] ?? actionType
}

function describePayload(payload: Record<string, unknown> | undefined): string {
  if (!payload) return 'Sin datos adicionales'
  const name = payload.name ?? payload.nombre
  const channel = payload.channel ?? payload.canal
  const parts = [name ? `Contacto: ${name}` : null, channel ? `Canal: ${channel}` : null]
  return parts.filter(Boolean).join(' · ') || 'Sin datos adicionales'
}

/**
 * Busca (sin crear) la conversación abierta del contacto que trajo esta
 * ejecución. Es de solo lectura a propósito: si ningún paso llegó a hablar
 * con nadie, no hay nada que enlazar, y eso está bien.
 */
async function findConversationId(
  businessId: string,
  payload: Record<string, unknown> | undefined,
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

/* ------------------------------------------------------------------ */
/* Contactos                                                           */
/* ------------------------------------------------------------------ */

interface LeadResult {
  id: string
  created: boolean
}

/**
 * Busca un contacto por email o teléfono antes de crearlo. La usan tanto
 * `crear_lead` como `responder_ia`: una persona que escribe por WhatsApp no
 * debería generar una ficha distinta cada vez que vuelve a escribir.
 */
async function findOrCreateLead(
  businessId: string,
  payload: Record<string, unknown> | undefined,
  actionConfig: Record<string, unknown>,
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
      stage: String(actionConfig.stage ?? 'nuevo'),
      temperature: 'templado',
    })
    .select('id')
    .single()

  if (error) throw new Error(`No se pudo crear el contacto: ${error.message}`)
  return { id: data.id, created: true }
}

/**
 * Búsqueda por palabras clave sobre los documentos que el negocio ha subido y
 * procesado en "Conocimiento". Es la misma estrategia de respaldo que usa el
 * frontend mientras no haya una base vectorial real conectada (Qdrant): sin
 * un motor de embeddings de por medio, coincidencia de palabras es lo que hay
 * — mejor esto que un agente que nunca lea lo que el negocio le dio.
 */
async function searchKnowledge(businessId: string, query: string): Promise<string | null> {
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
    .map((row) => {
      const content = row.content.toLowerCase()
      const hits = terms.filter((t) => content.includes(t)).length
      return { content: row.content as string, score: hits / terms.length }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  return ranked.map((r) => r.content).join('\n\n')
}

/* ------------------------------------------------------------------ */
/* Respuesta de un agente                                              */
/* ------------------------------------------------------------------ */

/**
 * Registra la conversación real y, si hay un modelo configurado, genera la
 * respuesta del agente. Sin clave de Anthropic, la conversación se crea igual
 * — para que el negocio vea que alguien escribió — pero sin fingir una
 * respuesta automática que nadie generó.
 */
async function respondWithAgent(
  businessId: string,
  actionConfig: Record<string, unknown>,
  payload: Record<string, unknown> | undefined,
): Promise<string> {
  const incomingText = String(payload?.message ?? payload?.text ?? payload?.mensaje ?? '').trim()
  const channel = String(payload?.channel ?? payload?.canal ?? 'web')

  const { id: leadId } = await findOrCreateLead(businessId, payload, {})

  // Una conversación abierta por canal y contacto; si ya hay una, se reutiliza
  // en vez de abrir un hilo nuevo por cada mensaje.
  const { data: existingConversation } = await admin
    .from('conversations')
    .select('id')
    .eq('business_id', businessId)
    .eq('lead_id', leadId)
    .eq('channel', channel)
    .neq('status', 'cerrada')
    .maybeSingle()

  let conversationId = existingConversation?.id as string | undefined

  if (!conversationId) {
    const { data: created, error } = await admin
      .from('conversations')
      .insert({ business_id: businessId, lead_id: leadId, channel, handled_by: 'agente_ia' })
      .select('id')
      .single()

    if (error) throw new Error(`No se pudo crear la conversación: ${error.message}`)
    conversationId = created.id
  }

  if (incomingText) {
    await admin.from('messages').insert({
      conversation_id: conversationId,
      business_id: businessId,
      role: 'contacto',
      content: incomingText,
    })
  }

  // Qué agente responde: el que pida la automatización, o el primero activo.
  // Siempre exigiendo que esté activo — si el que pide la automatización está
  // en pausa, no se usa igualmente ni se sustituye por otro de otro tipo, que
  // hablaría con la personalidad y el objetivo equivocados. Pausar un agente
  // desde Agentes IA tiene que detenerlo de verdad, también aquí.
  const agentType = actionConfig.agent ? String(actionConfig.agent) : null
  let agentQuery = admin
    .from('ai_agents')
    .select('id, system_prompt, status')
    .eq('business_id', businessId)
    .eq('status', 'activo')

  if (agentType) agentQuery = agentQuery.eq('type', agentType)
  const { data: agent } = await agentQuery.limit(1).maybeSingle()

  if (!isAnthropicConfigured) {
    await admin.from('messages').insert({
      conversation_id: conversationId,
      business_id: businessId,
      role: 'sistema',
      content: 'Conecta un modelo de IA para que este agente responda automáticamente.',
    })
    return `Conversación registrada, pendiente de conectar la IA (${conversationId})`
  }

  if (!agent?.system_prompt) {
    return `Conversación registrada, sin agente activo que responda (${conversationId})`
  }

  const { data: history } = await admin
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(20)

  const claudeMessages = (history ?? [])
    .filter((m) => m.role !== 'sistema')
    .map((m) => ({
      role: (m.role === 'contacto' ? 'user' : 'assistant') as const,
      content: m.content,
    }))

  if (claudeMessages.length === 0 || claudeMessages[claudeMessages.length - 1].role !== 'user') {
    claudeMessages.push({ role: 'user', content: incomingText || 'Hola' })
  }

  // Lo que suba el negocio a "Conocimiento" tiene que servir para algo: se
  // añade al prompt solo para esta respuesta, sin tocar el system_prompt
  // guardado del agente, que sigue siendo el que se ve y se edita en su ficha.
  const relevantKnowledge = await searchKnowledge(businessId, incomingText)
  const system = relevantKnowledge
    ? `${agent.system_prompt}\n\n---\n\nINFORMACIÓN ADICIONAL DE TU NEGOCIO, relevante para este mensaje:\n\n${relevantKnowledge}`
    : agent.system_prompt

  const reply = await complete({
    system,
    messages: claudeMessages,
    effort: 'low',
    maxTokens: 700,
  })

  await admin.from('messages').insert({
    conversation_id: conversationId,
    business_id: businessId,
    role: 'agente_ia',
    content: reply,
  })

  return `Agente respondió (conversación ${conversationId})`
}
