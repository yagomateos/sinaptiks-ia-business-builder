/**
 * Edge Function `automation-inactivity-scan` — llamada cada 30 minutos por el
 * cron de Postgres (`run_inactivity_scan`, migración
 * `automation_inactivity_dispatch`), nunca por un cliente.
 *
 * A diferencia de "programado" (n8n dispara su propio nodo de horario solo,
 * sin ayuda nuestra — ver `buildTriggerNode` en workflow-builder.ts),
 * "inactividad" depende de que algo revise qué conversaciones llevan N horas
 * esperando respuesta del contacto. Eso es lo que hace esta función.
 *
 * A propósito no dispara ninguna automatización con un paso `responder_ia`:
 * no hay ningún mensaje real al que responder, así que respondWithAgent
 * caería a su "Hola" de respaldo e inventaría una respuesta que además
 * n8n-callback no reenvía a ningún canal real. Misma exclusión que
 * conversation-pipeline.ts y la migración automation_stage_dispatch.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { n8n } from '../_shared/n8n-client.ts'
import { webhookPathFor } from '../_shared/workflow-builder.ts'

const DISPATCH_SECRET = Deno.env.get('AUTOMATION_DISPATCH_SECRET') ?? ''

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

interface InactivityAutomation {
  id: string
  business_id: string
  trigger: { config?: { hours?: number } }
  actions: { type: string }[]
}

interface CandidateConversation {
  id: string
  lead_id: string
  last_message_at: string
  last_inactivity_notice_at: string | null
  leads: { full_name: string; email: string | null; phone: string | null; source: string } | null
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Método no permitido', { status: 405 })
  }

  if (!DISPATCH_SECRET || request.headers.get('x-automation-secret') !== DISPATCH_SECRET) {
    console.warn('automation-inactivity-scan rechazado: secreto incorrecto')
    return new Response('No autorizado', { status: 401 })
  }

  const { data } = await admin
    .from('automations')
    .select('id, business_id, trigger, actions')
    .eq('status', 'activa')
    .eq('trigger->>type', 'inactividad')
    .not('n8n_workflow_id', 'is', null)

  const automations = (data ?? []) as InactivityAutomation[]
  let fired = 0

  for (const automation of automations) {
    if (automation.actions.some((a) => a.type === 'responder_ia')) continue

    const hours = Number(automation.trigger.config?.hours ?? 24)
    const threshold = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

    const { data: conversations } = await admin
      .from('conversations')
      .select(
        'id, lead_id, last_message_at, last_inactivity_notice_at, leads(full_name, email, phone, source)',
      )
      .eq('business_id', automation.business_id)
      .eq('handled_by', 'agente_ia')
      .neq('status', 'cerrada')
      .in('last_message_role', ['agente_ia', 'humano'])
      .lte('last_message_at', threshold)

    // No se puede comparar dos columnas de la misma fila en un filtro de
    // PostgREST — se trae el candidato por umbral y se descarta en JS el que
    // ya se avisó desde el último mensaje.
    // El cliente sin tipos generados no puede saber que conversations→leads
    // es de-uno-a-uno (cada conversación tiene un solo lead) e infiere el
    // embed como array — en runtime PostgREST sí devuelve un único objeto.
    const due = ((conversations ?? []) as unknown as CandidateConversation[]).filter(
      (c) => !c.last_inactivity_notice_at || c.last_inactivity_notice_at < c.last_message_at,
    )

    for (const conversation of due) {
      const lead = conversation.leads

      try {
        await n8n.trigger(webhookPathFor({ id: automation.id }), {
          name: lead?.full_name,
          email: lead?.email,
          phone: lead?.phone,
          channel: lead?.source,
          businessId: automation.business_id,
          leadId: conversation.lead_id,
          conversationId: conversation.id,
          source: 'evento_real',
          triggeredAt: new Date().toISOString(),
        })
        fired++
      } catch (error) {
        console.error(`No se pudo disparar la automatización ${automation.id} (inactividad)`, error)
        continue
      }

      await admin
        .from('conversations')
        .update({ last_inactivity_notice_at: new Date().toISOString() })
        .eq('id', conversation.id)
    }
  }

  return Response.json({ ok: true, fired })
})
