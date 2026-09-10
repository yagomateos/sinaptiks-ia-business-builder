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
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import {
  findConversationId,
  findOrCreateLead,
  respondWithAgent,
} from '../_shared/conversation-pipeline.ts'
import { sendTelegramMessage } from '../_shared/telegram-client.ts'
import { isResendConfigured, sendEmail } from '../_shared/resend-client.ts'
import { automationEmailHtml } from '../_shared/email-templates.ts'

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
    .select('id, name, business_id, actions, trigger')
    .eq('id', automationId)
    .eq('business_id', businessId)
    .maybeSingle()

  if (!automation) {
    console.warn(`Callback para automatización inexistente: ${automationId}`)
    return new Response('No encontrada', { status: 404 })
  }

  try {
    const detail = await performAction(
      body,
      automation.name,
      automation.trigger as { type: string; config?: Record<string, unknown> },
    )

    // Solo se registra una ejecución por disparo, no una por paso. La
    // conversación puede haberla creado un paso anterior (cada paso es una
    // llamada HTTP separada, sin memoria compartida), así que se localiza de
    // forma independiente aquí a partir de los mismos datos de contacto —
    // idéntico a como cualquier paso encontraría al mismo contacto — para
    // poder enlazarla desde el historial sin tener que ir a buscarla.
    if (body.isLastStep) {
      const conversationId = await findConversationId(admin, businessId, body.payload)

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

    // Cada paso es una llamada HTTP independiente desde n8n: si este falla,
    // los pasos anteriores ya se ejecutaron (o no habría llegado la llamada).
    // Sin decirlo explícitamente, la única fila que queda de esta ejecución
    // parece un fallo total en vez de una interrupción a mitad de camino.
    const totalSteps = Array.isArray(automation.actions) ? automation.actions.length : null
    const stepIndex = body.stepIndex
    const stepLabel =
      typeof stepIndex === 'number'
        ? totalSteps
          ? `paso ${stepIndex + 1} de ${totalSteps}`
          : `paso ${stepIndex + 1}`
        : null
    const progressNote =
      typeof stepIndex === 'number' && stepIndex > 0
        ? `Se completaron los ${stepIndex} paso(s) anteriores. `
        : ''
    const errorMessage = stepLabel
      ? `${progressNote}Falló en el ${stepLabel} (${describeAction(actionType)}): ${message}`
      : message

    await admin.from('automation_executions').insert({
      automation_id: automationId,
      business_id: businessId,
      status: 'error',
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      error_message: errorMessage,
      payload: { actionType, stepIndex: stepIndex ?? null, totalSteps },
    })

    await admin.from('notifications').insert({
      business_id: businessId,
      level: 'error',
      title: `Automatización "${automation.name}" falló`,
      body: errorMessage,
      entity_type: 'automation',
      entity_id: automationId,
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
async function performAction(
  body: CallbackBody,
  automationName: string,
  trigger: { type: string; config?: Record<string, unknown> },
): Promise<string> {
  const { businessId, actionType, actionConfig, payload } = body

  switch (actionType) {
    case 'enviar_telegram': {
      // Un mensaje_entrante o cambio_estado ya conectado trae el contacto
      // concreto en el payload (ver conversation-pipeline.ts) — se le
      // manda a él directamente. Un "programado" no trae ningún contacto
      // (el disparador de horario de n8n no sabe de leads): hay que ir a
      // buscar a quién le toca según la condición del disparador.
      const directPhone = String(payload?.phone ?? payload?.telefono ?? '')
      if (directPhone.startsWith('tg:')) {
        return await sendTelegramToOneLead(admin, businessId, directPhone, automationName)
      }
      return await sendTelegramBroadcast(admin, businessId, trigger, automationName)
    }

    // enviar_email y solicitar_resena solo cubren aquí el caso en que el
    // disparador ya trae un contacto concreto (mensaje_entrante o
    // cambio_estado) — que es como llega el payload en todos los blueprints
    // reales que combinan estos con esos disparadores. Un "programado" que
    // manda un resumen o contenido genérico (no a un lead concreto)
    // necesitaría decidir a qué destinatario del negocio va, y eso sigue sin
    // resolver — cae al `default` de abajo, sigue como "pendiente".
    case 'enviar_email':
    case 'solicitar_resena': {
      const directEmail = String(payload?.email ?? '')
      if (!directEmail) {
        return await recordPendingChannel(businessId, body.automationId, automationName, actionType)
      }

      return await sendAutomationEmail(
        admin,
        businessId,
        body.automationId,
        actionType,
        directEmail,
        automationName,
        actionType === 'solicitar_resena'
          ? 'Nos encantaría conocer tu opinión — tu reseña nos ayuda muchísimo.'
          : `Te escribimos sobre: ${automationName}.`,
      )
    }
    case 'crear_lead': {
      const { id, created } = await findOrCreateLead(
        admin,
        businessId,
        payload,
        String(actionConfig.stage ?? 'nuevo'),
      )
      return created ? `Contacto creado (${id})` : `El contacto ya existía (${id})`
    }

    case 'responder_ia': {
      const incomingText = String(payload?.message ?? payload?.text ?? payload?.mensaje ?? '').trim()
      const channel = String(payload?.channel ?? payload?.canal ?? 'web')
      const agentType = actionConfig.agent ? String(actionConfig.agent) : null

      const result = await respondWithAgent(admin, businessId, {
        payload,
        incomingText,
        channel,
        agentType,
      })

      return result.reply
        ? `Agente respondió (conversación ${result.conversationId})`
        : `Conversación registrada, ${result.reason} (${result.conversationId})`
    }

    case 'actualizar_lead': {
      // Si el paso trae un id explícito se usa tal cual; si no, se localiza
      // por email o teléfono — el mismo contacto que un paso anterior de la
      // misma automatización puede haber creado.
      const explicitId = payload?.leadId ?? payload?.lead_id
      const leadId = explicitId
        ? String(explicitId)
        : (await findOrCreateLead(admin, businessId, payload)).id

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
      // enviar_whatsapp, agendar_cita, y enviar_email/solicitar_resena sin
      // contacto directo (programado): pendientes de conectar su canal.
      return await recordPendingChannel(businessId, body.automationId, automationName, actionType)
    }
  }
}

const ACTION_DESCRIPTIONS: Record<string, string> = {
  enviar_whatsapp: 'mensaje de WhatsApp pendiente de enviar',
  agendar_cita: 'cita pendiente de agendar',
  // Solo se usan cuando de verdad no se pudo enviar (Resend sin configurar,
  // o el disparador no trae un contacto directo) — con Resend activo y un
  // contacto concreto, enviar_email/solicitar_resena sí salen de verdad.
  enviar_email: 'email pendiente de enviar',
  solicitar_resena: 'solicitud de reseña pendiente',
}

async function recordPendingChannel(
  businessId: string,
  automationId: string,
  automationName: string,
  actionType: string,
): Promise<string> {
  await admin.from('activity_logs').insert({
    business_id: businessId,
    actor_label: 'Automatización',
    action: `${automationName}: ${describeAction(actionType)}`,
    entity_type: 'automation',
    entity_id: automationId,
    metadata: { actionType, pendiente_de_canal: true },
  })

  return `Paso registrado (${actionType} requiere conectar su canal)`
}

async function sendAutomationEmail(
  admin: SupabaseClient,
  businessId: string,
  automationId: string,
  actionType: string,
  to: string,
  automationName: string,
  bodyText: string,
): Promise<string> {
  if (!isResendConfigured) {
    return await recordPendingChannel(businessId, automationId, automationName, actionType)
  }

  const businessName = await getBusinessName(admin, businessId)

  await sendEmail({
    to,
    subject: automationName,
    html: automationEmailHtml({ businessName, heading: automationName, bodyText }),
  })

  return 'Email enviado'
}

/** Envía a un contacto concreto (payload trae su phone `tg:<chat_id>`). */
async function sendTelegramToOneLead(
  admin: SupabaseClient,
  businessId: string,
  phone: string,
  automationName: string,
): Promise<string> {
  const botToken = await getTelegramBotToken(admin, businessId)
  if (!botToken) return 'Sin bot de Telegram conectado para este negocio'

  const chatId = phone.slice('tg:'.length)
  const businessName = await getBusinessName(admin, businessId)

  await sendTelegramMessage(
    botToken,
    chatId,
    `Hola, te escribimos de ${businessName}: ${automationName}.`,
  )
  return 'Mensaje de Telegram enviado'
}

/**
 * "programado" no trae ningún contacto — el nodo de horario de n8n se
 * dispara solo, sin saber de leads (ver workflow-builder.ts). Aquí se busca
 * a quién le toca según la condición del propio disparador:
 * - `offset_hours` (p. ej. -24): leads con cita para ese día concreto.
 * - `inactive_days`: leads sin contacto desde hace ese tiempo.
 * `last_reminder_sent_at` evita mandar el mismo aviso dos veces por la misma
 * cita o el mismo periodo de inactividad.
 */
async function sendTelegramBroadcast(
  admin: SupabaseClient,
  businessId: string,
  trigger: { type: string; config?: Record<string, unknown> },
  automationName: string,
): Promise<string> {
  const botToken = await getTelegramBotToken(admin, businessId)
  if (!botToken) return 'Sin bot de Telegram conectado para este negocio'

  const businessName = await getBusinessName(admin, businessId)
  const offsetHours = trigger.config?.offset_hours
  const inactiveDays = trigger.config?.inactive_days

  let candidates: { id: string; full_name: string; phone: string | null; last_reminder_sent_at: string | null; reference: string }[] = []
  let message: (nombre: string) => string

  if (typeof offsetHours === 'number') {
    const hoursAhead = Math.abs(offsetHours)
    const target = new Date(Date.now() + hoursAhead * 60 * 60 * 1000)
    const dayStart = new Date(target)
    dayStart.setUTCHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

    const { data } = await admin
      .from('leads')
      .select('id, full_name, phone, last_reminder_sent_at, next_action_at')
      .eq('business_id', businessId)
      .eq('stage', 'cita')
      .not('next_action_at', 'is', null)
      .gte('next_action_at', dayStart.toISOString())
      .lt('next_action_at', dayEnd.toISOString())

    candidates = (data ?? []).map((l) => ({ ...l, reference: l.next_action_at as string }))
    message = (nombre) => `Hola ${nombre}, te recordamos tu cita mañana en ${businessName}. ¡Te esperamos!`
  } else if (typeof inactiveDays === 'number') {
    const threshold = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000).toISOString()

    const { data } = await admin
      .from('leads')
      .select('id, full_name, phone, last_reminder_sent_at, last_contacted_at')
      .eq('business_id', businessId)
      .lt('last_contacted_at', threshold)

    candidates = (data ?? []).map((l) => ({ ...l, reference: l.last_contacted_at as string }))
    message = (nombre) =>
      `Hola ${nombre}, hace tiempo que no sabemos de ti en ${businessName}. ¿Te interesa alguna novedad?`
  } else {
    return 'Este disparador "programado" no trae una condición reconocida (offset_hours / inactive_days)'
  }

  // No se puede comparar dos columnas de la misma fila en un filtro de
  // PostgREST — se trae el candidato por la condición principal y se
  // descarta en JS el que ya se avisó desde la última referencia (la cita o
  // el último contacto).
  const due = candidates.filter(
    (l) =>
      l.phone?.startsWith('tg:') &&
      (!l.last_reminder_sent_at || l.last_reminder_sent_at < l.reference),
  )

  let sent = 0
  for (const lead of due) {
    try {
      await sendTelegramMessage(botToken, lead.phone!.slice('tg:'.length), message(lead.full_name))
      await admin
        .from('leads')
        .update({ last_reminder_sent_at: new Date().toISOString() })
        .eq('id', lead.id)
      sent++
    } catch (error) {
      console.error(`No se pudo enviar el recordatorio de Telegram a ${lead.id}`, error)
    }
  }

  return `${sent} de ${due.length} recordatorio(s) enviados`
}

async function getTelegramBotToken(
  admin: SupabaseClient,
  businessId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('channel_credentials')
    .select('credential')
    .eq('business_id', businessId)
    .eq('provider', 'telegram')
    .maybeSingle()

  return (data?.credential as { bot_token?: string } | null)?.bot_token ?? null
}

async function getBusinessName(admin: SupabaseClient, businessId: string): Promise<string> {
  const { data } = await admin
    .from('business_profiles')
    .select('business_name')
    .eq('business_id', businessId)
    .maybeSingle()

  return data?.business_name ?? 'nuestro negocio'
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
