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
import { sendWhatsAppMessage } from '../_shared/whatsapp-client.ts'
import { isResendConfigured, sendEmail } from '../_shared/resend-client.ts'
import { automationEmailHtml } from '../_shared/email-templates.ts'
import { bookCalendarAppointment } from '../_shared/appointment-booking.ts'
import { zonedWallClockToUtc } from '../_shared/timezone.ts'
import { findBroadcastCandidates, isDue } from '../_shared/automation-broadcast.ts'

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

  // El paso ejecutado tiene que ser exactamente el que está guardado en la
  // automatización — nunca lo que diga el body. Comprobar solo que
  // `automationId` pertenece al negocio no basta: si el secreto de callback
  // se filtrara, alguien podría forzar cualquier `actionType`/`actionConfig`
  // (enviar un email, crear una cita) sobre un negocio real reutilizando un
  // `automationId` válido. Aquí se sustituye la config del body por la que
  // de verdad está guardada, tal como pide CLAUDE.md: la definición se lee
  // de la base de datos, nunca se confía en lo que llega en la petición.
  const storedActions = Array.isArray(automation.actions)
    ? (automation.actions as Array<{ type: string; config?: Record<string, unknown> }>)
    : []
  const storedAction =
    typeof body.stepIndex === 'number' ? storedActions[body.stepIndex] : undefined

  if (!storedAction || storedAction.type !== actionType) {
    console.warn(
      `Callback con acción no coincidente: automatización ${automationId}, paso ${body.stepIndex}, tipo recibido ${actionType}`,
    )
    return new Response('La acción no coincide con la automatización', { status: 400 })
  }

  body.actionConfig = storedAction.config ?? {}

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
      return await sendTelegramBroadcast(admin, businessId, trigger)
    }

    case 'enviar_whatsapp': {
      // Mismo reparto que enviar_telegram: un contacto directo trae `wa:` en
      // el teléfono (ver whatsapp-webhook.ts). Sin WhatsApp conectado para
      // este negocio, o sin un contacto directo (programado — sin un
      // blueprint real hoy que lo combine, no hay una difusión que resolver
      // todavía), se registra como pendiente.
      const directPhone = String(payload?.phone ?? payload?.telefono ?? '')
      if (directPhone.startsWith('wa:')) {
        return await sendWhatsAppToOneLead(admin, businessId, directPhone, automationName)
      }
      return await recordPendingChannel(businessId, body.automationId, automationName, actionType)
    }

    // enviar_email y solicitar_resena: si el disparador ya trae un contacto
    // concreto (mensaje_entrante o cambio_estado), se manda directo. Un
    // "programado" no trae ningún contacto (el nodo de horario de n8n se
    // dispara solo, sin saber de leads) — se busca a quién le toca según la
    // condición del propio disparador (mismo cálculo que enviar_telegram).
    case 'enviar_email':
    case 'solicitar_resena': {
      const directEmail = String(payload?.email ?? '')
      if (directEmail) {
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
      return await sendEmailBroadcast(admin, businessId, body.automationId, actionType, trigger, automationName)
    }
    case 'agendar_cita': {
      // Necesita servicio + hora de inicio (fecha_hora_iso, mismo campo que
      // ya usa la herramienta registrar_solicitud_cita en
      // conversation-pipeline.ts) y un contacto directo. Sin calendario
      // conectado o sin esos datos, se registra como pendiente en vez de
      // fingir una cita que no existe en ningún calendario real.
      const timezone = String(actionConfig.timezone ?? 'Europe/Madrid')
      const startsAtRaw = payload?.fecha_hora_iso ?? payload?.startsAt
      // fecha_hora_iso llega sin offset ("2026-09-14T10:00:00"), pensada como
      // hora de pared en `timezone` — new Date(str) la trataría como UTC
      // directamente, un desfase real de 2h en verano (CEST). Ver timezone.ts.
      const startsAt = startsAtRaw ? zonedWallClockToUtc(String(startsAtRaw), timezone) : null
      const email = payload?.email ? String(payload.email) : null

      if (!startsAt || isNaN(startsAt.getTime()) || !email) {
        return await recordPendingChannel(businessId, body.automationId, automationName, actionType)
      }

      return await createCalendarAppointment(admin, businessId, body.automationId, {
        leadId: (payload?.leadId as string | undefined) ?? null,
        service: String(payload?.servicio ?? payload?.service ?? automationName),
        startsAt,
        durationMinutes: Number(actionConfig.duration_minutes ?? payload?.duration_minutes ?? 60),
        timezone,
        attendeeEmail: email,
      })
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
      return await recordPendingChannel(businessId, body.automationId, automationName, actionType)
    }
  }
}

const ACTION_DESCRIPTIONS: Record<string, string> = {
  enviar_whatsapp: 'mensaje de WhatsApp pendiente de enviar',
  agendar_cita: 'cita pendiente de agendar',
  // Solo se usan cuando de verdad no se pudo enviar (Resend sin configurar):
  // con Resend activo, enviar_email/solicitar_resena sí salen de verdad,
  // sea a un contacto directo o por difusión (programado).
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

async function createCalendarAppointment(
  admin: SupabaseClient,
  businessId: string,
  automationId: string,
  input: {
    leadId: string | null
    service: string
    startsAt: Date
    durationMinutes: number
    timezone: string
    attendeeEmail: string
  },
): Promise<string> {
  const result = await bookCalendarAppointment(admin, businessId, { ...input, automationId })

  switch (result.status) {
    case 'sin_calendario':
      return await recordPendingChannel(businessId, automationId, input.service, 'agendar_cita')
    case 'conflicto':
      // Se lanza (en vez de devolver un string) para que quede como fallo en
      // automation_executions y dispare el aviso al equipo que ya existe
      // para cualquier paso fallido — no hace falta duplicar esa notificación.
      throw new Error(`${result.message} Contacta con el cliente para ofrecerle otra hora.`)
    case 'error':
      throw new Error(result.message)
    case 'confirmada':
      return `Cita creada en Google Calendar (${result.externalEventId})`
  }
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

/** Envía a un contacto concreto (payload trae su phone `wa:<numero>`). */
async function sendWhatsAppToOneLead(
  admin: SupabaseClient,
  businessId: string,
  phone: string,
  automationName: string,
): Promise<string> {
  const credential = await getWhatsAppCredential(admin, businessId)
  if (!credential) return 'Sin WhatsApp conectado para este negocio'

  const to = phone.slice('wa:'.length)
  const businessName = await getBusinessName(admin, businessId)

  await sendWhatsAppMessage(
    credential.accessToken,
    credential.phoneNumberId,
    to,
    `Hola, te escribimos de ${businessName}: ${automationName}.`,
  )
  return 'Mensaje de WhatsApp enviado'
}

/**
 * "programado" no trae ningún contacto — el nodo de horario de n8n se
 * dispara solo, sin saber de leads (ver workflow-builder.ts).
 * `findBroadcastCandidates` decide a quién le toca según la condición del
 * propio disparador (offset_hours / inactive_days); aquí solo queda filtrar
 * por canal (tiene `tg:<chat_id>` en `phone`) y descartar a quien ya se avisó
 * (`isDue`, compara con `last_reminder_sent_at`).
 */
async function sendTelegramBroadcast(
  admin: SupabaseClient,
  businessId: string,
  trigger: { type: string; config?: Record<string, unknown> },
): Promise<string> {
  const botToken = await getTelegramBotToken(admin, businessId)
  if (!botToken) return 'Sin bot de Telegram conectado para este negocio'

  const candidates = await findBroadcastCandidates(admin, businessId, trigger)
  if (candidates.length === 0 && !trigger.config?.offset_hours && !trigger.config?.inactive_days) {
    return 'Este disparador "programado" no trae una condición reconocida (offset_hours / inactive_days)'
  }

  const businessName = await getBusinessName(admin, businessId)
  const isReminder = typeof trigger.config?.offset_hours === 'number'
  const message = (nombre: string) =>
    isReminder
      ? `Hola ${nombre}, te recordamos tu cita mañana en ${businessName}. ¡Te esperamos!`
      : `Hola ${nombre}, hace tiempo que no sabemos de ti en ${businessName}. ¿Te interesa alguna novedad?`

  const due = candidates.filter((l) => l.phone?.startsWith('tg:') && isDue(l))

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

/**
 * Mismo cálculo de destinatarios que `sendTelegramBroadcast`
 * (`findBroadcastCandidates`), pero por email: filtra por quien tiene
 * `email` en vez de `phone` con prefijo `tg:`, y usa Resend en vez del bot de
 * Telegram. `solicitar_resena` solo tiene sentido con `inactive_days`
 * (pedir reseña a quien no ha vuelto), pero no se fuerza aquí — si alguien
 * configura `solicitar_resena` con `offset_hours`, se manda el texto de
 * recordatorio de cita en vez de fallar en silencio.
 */
async function sendEmailBroadcast(
  admin: SupabaseClient,
  businessId: string,
  automationId: string,
  actionType: string,
  trigger: { type: string; config?: Record<string, unknown> },
  automationName: string,
): Promise<string> {
  if (!isResendConfigured) {
    return await recordPendingChannel(businessId, automationId, automationName, actionType)
  }

  const candidates = await findBroadcastCandidates(admin, businessId, trigger)
  if (candidates.length === 0 && !trigger.config?.offset_hours && !trigger.config?.inactive_days) {
    // "resumen_diario" / "campana_marketing" del catálogo disparan
    // "programado" con solo `cron`, sin condición de destinatario — n8n los
    // dispara solo, pero decidir a quién le toca (¿toda la cartera? ¿el
    // dueño del negocio?) es una funcionalidad distinta de "recordatorio de
    // cita" / "reactivación", que sí resuelve `findBroadcastCandidates`.
    // Queda honesto como pendiente en el panel en vez de silencioso.
    return await recordPendingChannel(businessId, automationId, automationName, actionType)
  }

  const businessName = await getBusinessName(admin, businessId)
  const isReminder = typeof trigger.config?.offset_hours === 'number'
  const bodyText = (nombre: string) =>
    isReminder
      ? `Hola ${nombre}, te recordamos tu cita mañana en ${businessName}. ¡Te esperamos!`
      : actionType === 'solicitar_resena'
        ? `Hola ${nombre}, hace tiempo que no sabemos de ti en ${businessName}. Nos encantaría conocer tu opinión — tu reseña nos ayuda muchísimo.`
        : `Hola ${nombre}, hace tiempo que no sabemos de ti en ${businessName}. ¿Te interesa alguna novedad?`

  const due = candidates.filter((l) => l.email && isDue(l))

  let sent = 0
  for (const lead of due) {
    try {
      await sendEmail({
        to: lead.email!,
        subject: automationName,
        html: automationEmailHtml({ businessName, heading: automationName, bodyText: bodyText(lead.full_name) }),
      })
      await admin
        .from('leads')
        .update({ last_reminder_sent_at: new Date().toISOString() })
        .eq('id', lead.id)
      sent++
    } catch (error) {
      console.error(`No se pudo enviar el email de difusión a ${lead.id}`, error)
    }
  }

  return `${sent} de ${due.length} email(s) enviados`
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

async function getWhatsAppCredential(
  admin: SupabaseClient,
  businessId: string,
): Promise<{ accessToken: string; phoneNumberId: string } | null> {
  const { data } = await admin
    .from('channel_credentials')
    .select('credential')
    .eq('business_id', businessId)
    .eq('provider', 'whatsapp')
    .maybeSingle()

  const credential = data?.credential as { access_token?: string; phone_number_id?: string } | null
  if (!credential?.access_token || !credential?.phone_number_id) return null

  return { accessToken: credential.access_token, phoneNumberId: credential.phone_number_id }
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
