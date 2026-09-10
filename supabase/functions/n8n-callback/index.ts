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
import {
  findConversationId,
  findOrCreateLead,
  respondWithAgent,
} from '../_shared/conversation-pipeline.ts'

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
    .select('id, name, business_id, actions')
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
      // enviar_telegram, enviar_whatsapp, enviar_email, agendar_cita,
      // solicitar_resena: pendientes de conectar su canal.
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
