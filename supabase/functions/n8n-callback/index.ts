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

    // Solo se registra una ejecución por disparo, no una por paso.
    if (body.isLastStep) {
      await admin.from('automation_executions').insert({
        automation_id: automationId,
        business_id: businessId,
        status: 'exito',
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - new Date(startedAt).getTime(),
        payload: { actionType, detail, source: body.payload?.source ?? 'n8n' },
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
 * Las que dependen de un canal externo (WhatsApp, email, calendario) todavía
 * no envían nada: dejan constancia en la actividad del negocio para que el
 * usuario vea que el flujo llegó hasta ahí. Es deliberado — es preferible que
 * no pase nada a fingir que se envió un mensaje que nadie recibió.
 */
async function performAction(body: CallbackBody, automationName: string): Promise<string> {
  const { businessId, actionType, actionConfig, payload } = body

  switch (actionType) {
    case 'crear_lead': {
      const name = String(payload?.name ?? payload?.nombre ?? 'Contacto sin nombre')
      const email = payload?.email ? String(payload.email) : null
      const phone = payload?.phone ?? payload?.telefono
      const channel = String(payload?.channel ?? payload?.canal ?? 'web')

      // Si ya existe por email o teléfono, no se duplica.
      if (email || phone) {
        const { data: existing } = await admin
          .from('leads')
          .select('id')
          .eq('business_id', businessId)
          .or([email ? `email.eq.${email}` : '', phone ? `phone.eq.${phone}` : '']
            .filter(Boolean)
            .join(','))
          .maybeSingle()

        if (existing) return `El contacto ya existía (${existing.id})`
      }

      const { data, error } = await admin
        .from('leads')
        .insert({
          business_id: businessId,
          full_name: name,
          email,
          phone: phone ? String(phone) : null,
          source: channel,
          stage: String(actionConfig.stage ?? 'nuevo'),
          temperature: 'templado',
        })
        .select('id')
        .single()

      if (error) throw new Error(`No se pudo crear el contacto: ${error.message}`)
      return `Contacto creado (${data.id})`
    }

    case 'actualizar_lead': {
      const leadId = payload?.leadId ?? payload?.lead_id
      if (!leadId) return 'Sin contacto que actualizar'

      const patch: Record<string, unknown> = { last_contacted_at: new Date().toISOString() }
      if (actionConfig.stage) patch.stage = actionConfig.stage
      if (actionConfig.temperature) patch.temperature = actionConfig.temperature

      const { error } = await admin
        .from('leads')
        .update(patch)
        .eq('id', String(leadId))
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
      // enviar_whatsapp, enviar_email, agendar_cita, responder_ia,
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
  enviar_whatsapp: 'mensaje de WhatsApp pendiente de enviar',
  enviar_email: 'email pendiente de enviar',
  agendar_cita: 'cita pendiente de agendar',
  responder_ia: 'respuesta del agente pendiente',
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
